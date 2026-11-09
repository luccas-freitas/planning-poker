"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";
import {
  isReactionEmoji,
  type Peer,
  type PresenceMeta,
  type Reaction,
  type Role,
  type Room,
  type Round,
} from "@/lib/room";
import { ensureSession, getSupabase } from "@/lib/supabase";

export type RoomStatus = "loading" | "ready" | "not-found" | "error";

export type RoomState = {
  status: RoomStatus;
  error?: string;
  room: Room | null;
  round: Round | null;
  userId: string | null;
  role: Role;
  /** Participantes online (Presence), em ordem de chegada. */
  peers: Omit<Peer, "hasVoted">[];
  /** Quem já votou na rodada atual (só ids; vem de `round_voters`). */
  voters: string[];
  /** Canal realtime conectado e escutando mudanças do banco. */
  connected: boolean;
  /**
   * Votos da rodada atual por user_id. Antes do reveal a RLS só devolve o
   * meu; depois do reveal, todos.
   */
  votes: Record<string, string>;
  /** Nome/avatar de todos os participantes da sala (carregado no reveal). */
  members: Record<string, Member>;
};

export type Member = { name: string; avatar: string | null };

const INITIAL: RoomState = {
  status: "loading",
  room: null,
  round: null,
  userId: null,
  role: "player",
  peers: [],
  voters: [],
  connected: false,
  votes: {},
  members: {},
};

/**
 * `channel()` do realtime-js reaproveita canais com o mesmo tópico e a remoção
 * é assíncrona. No StrictMode (dev) o efeito monta duas vezes, então esperamos
 * a remoção anterior terminar antes de criar o canal de novo.
 */
const pendingRemovals = new Map<string, Promise<unknown>>();

/**
 * O Supabase permite no máximo 5 atualizações de Presence por cliente a cada
 * 30 s; acima disso derruba o canal (ClientPresenceRateLimitReached). Com um
 * intervalo mínimo de 7 s nunca passamos de 5 em 30 s.
 */
const PRESENCE_MIN_GAP_MS = 7_000;
/** Espera antes de reconectar um canal derrubado (dobra a cada falha). */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** Agrupa avisos de "votei" que chegam juntos numa só busca. */
const VOTERS_DEBOUNCE_MS = 250;

function peersFromPresence(
  state: Record<string, PresenceMeta[]>,
  me: string,
): RoomState["peers"] {
  return Object.values(state)
    .map((metas) => metas[0]) // várias abas do mesmo usuário → uma pessoa
    .filter(Boolean)
    .map((m) => ({ ...m, isMe: m.userId === me }))
    .sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
}

export function useRoom(slug: string, profile: Profile | null | undefined) {
  const [state, setState] = useState<RoomState>(INITIAL);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<PresenceMeta | null>(null);
  const joinedProfile = useRef<string>("");
  const currentRoundId = useRef<string | null>(null);
  const reactionListeners = useRef(new Set<(r: Reaction) => void>());
  const lastReactionAt = useRef(0);
  /** Último Presence enviado (para não repetir e respeitar o limite). */
  const tracked = useRef<{
    at: number;
    key: string;
    channel: RealtimeChannel | null;
    timer?: ReturnType<typeof setTimeout>;
  }>({ at: 0, key: "", channel: null });
  /** Busca de quem votou, com debounce (ver `requestVoters`). */
  const votersTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const roomIdRef = useRef<string | null>(null);
  /** Votos em sequência: um RPC por vez, o último clique vence. */
  const voteQueue = useRef<{ running: boolean; next?: string | null }>({
    running: false,
  });

  /**
   * Publica meu Presence se mudou algo, no máximo uma vez a cada
   * PRESENCE_MIN_GAP_MS (o que chegar no meio do intervalo sai no fim dele).
   */
  const pushPresence = useCallback(() => {
    const t = tracked.current;
    const send = () => {
      t.timer = undefined;
      const channel = channelRef.current;
      const meta = presenceRef.current;
      if (!channel || !meta || channel.state !== "joined") return;
      const key = JSON.stringify(meta);
      // canal novo (reconexão) não tem meu Presence: precisa enviar de novo
      if (key === t.key && channel === t.channel) return;
      t.at = Date.now();
      t.key = key;
      t.channel = channel;
      void channel.track(meta);
    };
    if (t.timer) return; // já agendado; vai ler o estado mais recente
    const wait = t.at + PRESENCE_MIN_GAP_MS - Date.now();
    if (wait <= 0) send();
    else t.timer = setTimeout(send, wait);
  }, []);

  /** Recarrega quem votou na rodada atual (agrupando pedidos próximos). */
  const requestVoters = useCallback(() => {
    clearTimeout(votersTimer.current);
    votersTimer.current = setTimeout(async () => {
      const roomId = roomIdRef.current;
      const roundId = currentRoundId.current;
      if (!roomId) return;
      const { data } = await getSupabase().rpc("round_voters", {
        p_room_id: roomId,
      });
      if (!data) return;
      setState((s) =>
        // ignora resposta atrasada de uma rodada que já acabou
        s.round?.id === roundId && currentRoundId.current === roundId
          ? { ...s, voters: data }
          : s,
      );
    }, VOTERS_DEBOUNCE_MS);
  }, []);

  /** Avisa a sala que meu voto mudou (os outros recarregam `round_voters`). */
  const announceVote = useCallback(() => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "voted",
      payload: {},
    });
  }, []);

  const ready = !!profile;
  const profileName = profile?.name;
  const profileAvatar = profile?.avatar ?? null;

  // ---- conexão: entra na sala, carrega estado e assina o realtime ----------
  useEffect(() => {
    if (!ready) return;
    const supabase = getSupabase();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let topic = "";
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const update = (patch: Partial<RoomState>) => {
      if (!cancelled) setState((s) => ({ ...s, ...patch }));
    };

    async function loadRound(roundId: string | null) {
      currentRoundId.current = roundId;
      if (!roundId) return update({ round: null });
      const { data } = await supabase
        .from("rounds")
        .select()
        .eq("id", roundId)
        .single();
      if (data && !cancelled) {
        // mesma rodada (ex.: recarga após reconectar) mantém os votos
        setState((s) => {
          const same = s.round?.id === data.id;
          return {
            ...s,
            round: data,
            votes: same ? s.votes : {},
            voters: same ? s.voters : [],
          };
        });
        requestVoters();
      }
    }

    async function loadAll(roomId: string, userId: string) {
      const [{ data: room }, { data: me }] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, slug, name, current_round_id")
          .eq("id", roomId)
          .single(),
        supabase
          .from("participants")
          .select("role")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .single(),
      ]);
      if (!room) return;
      update({ room, role: (me?.role as Role) ?? "player" });
      await loadRound(room.current_round_id);
    }

    (async () => {
      try {
        const userId = await ensureSession();
        const { data: roomId, error } = await supabase.rpc("join_room", {
          p_slug: slug,
          p_display_name: profileName!,
          p_avatar_url: profileAvatar ?? undefined,
        });
        if (error) {
          return update(
            error.code === "P0002"
              ? { status: "not-found" }
              : { status: "error", error: error.message },
          );
        }
        if (cancelled) return;
        joinedProfile.current = `${profileName}|${profileAvatar}`;
        roomIdRef.current = roomId;
        update({ userId });
        await loadAll(roomId, userId);

        topic = `room:${roomId}`;
        void openChannel(roomId, userId);
        update({ status: "ready" });
      } catch (err) {
        update({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    /**
     * Fecha o canal atual e abre outro depois de uma espera crescente. Usado
     * quando o servidor derruba o canal (rede, limite de taxa, deploy do
     * Realtime): sem isso a pessoa ficava desconectada até recarregar a página.
     */
    function reconnect(roomId: string, userId: string) {
      if (cancelled || retryTimer) return;
      update({ connected: false });
      const old = channel;
      channel = null;
      channelRef.current = null;
      const removal = old ? supabase.removeChannel(old) : Promise.resolve();
      pendingRemovals.set(topic, removal);
      const delay = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * 2 ** retries++,
      );
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!cancelled) void openChannel(roomId, userId);
      }, delay);
    }

    async function openChannel(roomId: string, userId: string) {
      await pendingRemovals.get(topic);
      if (cancelled) return;

      const ch = supabase.channel(topic, {
        // self: o remetente também recebe a própria reação (um só caminho)
        config: { presence: { key: userId }, broadcast: { self: true } },
      });
      channel = ch;
      channelRef.current = ch;

      ch.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        ({ new: row }) => {
          const room = row as Room;
          if (currentRoundId.current !== room.current_round_id) {
            void loadRound(room.current_round_id);
          }
          setState((s) => ({ ...s, room: { ...s.room!, ...room } }));
        },
      )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rounds",
            filter: `room_id=eq.${roomId}`,
          },
          ({ new: row }) => {
            const round = row as Round;
            if (round.id === currentRoundId.current) update({ round });
          },
        )
        .on("broadcast", { event: "reaction" }, ({ payload }) => {
          // payload vem de outros clientes: valida antes de usar
          const p = payload as Partial<Reaction>;
          if (!isReactionEmoji(p.emoji) || typeof p.from !== "string") return;
          const reaction: Reaction = {
            id: crypto.randomUUID(),
            emoji: p.emoji,
            from: p.from,
            to: typeof p.to === "string" ? p.to : undefined,
          };
          reactionListeners.current.forEach((l) => l(reaction));
        })
        // alguém votou/retirou o voto: recarrega quem votou (sem payload
        // confiável: a fonte da verdade é o banco)
        .on("broadcast", { event: "voted" }, () => requestVoters())
        .on("presence", { event: "sync" }, () => {
          const presence = ch.presenceState<PresenceMeta>();
          update({ peers: peersFromPresence(presence, userId) });
        })
        .on("system", {}, (msg) => {
          // só a partir daqui o postgres_changes está ativo: recarrega para
          // não perder nada que mudou entre o fetch inicial e a assinatura
          if (msg.extension === "postgres_changes" && msg.status === "ok") {
            retries = 0;
            update({ connected: true });
            void loadAll(roomId, userId);
          }
        })
        .subscribe((status) => {
          if (cancelled || channel !== ch) return; // canal antigo/removido
          if (status === "SUBSCRIBED") {
            pushPresence();
          } else {
            // CHANNEL_ERROR, TIMED_OUT ou CLOSED pelo servidor
            reconnect(roomId, userId);
          }
        });
    }

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      channelRef.current = null;
      if (channel) {
        const removal = supabase.removeChannel(channel);
        pendingRemovals.set(topic, removal);
        void removal.finally(() => {
          if (pendingRemovals.get(topic) === removal) {
            pendingRemovals.delete(topic);
          }
        });
      }
      setState(INITIAL);
    };
    // nome/avatar mudam sem reconectar (efeito abaixo); só reconecta por sala
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ready]);

  const { userId, role, status, room, round } = state;
  const roundId = round?.id;
  const revealed = round?.revealed ?? false;
  const myVote = userId ? (state.votes[userId] ?? null) : null;

  // ---- Votos: recarrega ao trocar de rodada e ao revelar --------------------
  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    const supabase = getSupabase();
    (async () => {
      const [{ data: votes }, members] = await Promise.all([
        supabase.from("votes").select("user_id, value").eq("round_id", roundId),
        // no reveal, carrega nomes de todos (inclusive quem votou e saiu)
        revealed && room
          ? supabase
              .from("participants")
              .select("user_id, display_name, avatar_url")
              .eq("room_id", room.id)
              .then(({ data }) => data)
          : null,
      ]);
      if (cancelled || !votes) return;
      setState((s) => {
        if (s.round?.id !== roundId) return s;
        const next = {
          ...s,
          votes: Object.fromEntries(votes.map((v) => [v.user_id, v.value])),
        };
        if (members) {
          next.members = Object.fromEntries(
            members.map((m) => [
              m.user_id,
              { name: m.display_name, avatar: m.avatar_url },
            ]),
          );
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // room.id não muda durante a vida do hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, revealed]);

  // ---- Presence: publica meus dados (nome, avatar, papel) -------------------
  // Só o que muda raramente vai no Presence (limite de 5 atualizações/30 s).
  // O voto vai por Broadcast ("voted") + `round_voters`.
  useEffect(() => {
    if (!userId || !profileName) return;
    presenceRef.current = {
      userId,
      name: profileName,
      avatar: profileAvatar,
      role,
      onlineAt: presenceRef.current?.onlineAt ?? new Date().toISOString(),
    };
    pushPresence();
  }, [userId, profileName, profileAvatar, role, pushPresence]);

  // limpa timers pendentes ao sair da sala
  useEffect(
    () => () => {
      clearTimeout(tracked.current.timer);
      clearTimeout(votersTimer.current);
      tracked.current = { at: 0, key: "", channel: null };
    },
    [slug],
  );

  // ---- Perfil editado dentro da sala: atualiza o registro no banco ---------
  useEffect(() => {
    if (status !== "ready" || !room || !profileName) return;
    const key = `${profileName}|${profileAvatar}`;
    if (joinedProfile.current === key) return;
    joinedProfile.current = key;
    // builders do supabase-js são lazy: só executam com await/then
    getSupabase()
      .rpc("join_room", {
        p_slug: room.slug,
        p_display_name: profileName,
        p_avatar_url: profileAvatar ?? undefined,
      })
      .then(({ error }) => {
        if (error) joinedProfile.current = ""; // tenta de novo na próxima mudança
      });
  }, [status, room, profileName, profileAvatar]);

  // ---- Ações ---------------------------------------------------------------
  const setRole = useCallback(
    async (next: Role) => {
      if (!room) return;
      const { error } = await getSupabase().rpc("set_role", {
        p_room_id: room.id,
        p_role: next,
      });
      if (error) throw error;
      setState((s) => {
        if (next === "player" || !s.userId) return { ...s, role: next };
        // o RPC apaga o voto da rodada aberta; espelha localmente
        const votes = { ...s.votes };
        if (!s.round?.revealed) delete votes[s.userId];
        return { ...s, role: next, votes };
      });
      if (next === "spectator") announceVote();
    },
    [room, announceVote],
  );

  /** Envia uma reação (no máx. ~4 por segundo por pessoa). */
  const sendReaction = useCallback(
    (emoji: string, to?: string) => {
      const channel = channelRef.current;
      const now = Date.now();
      if (!channel || !userId || now - lastReactionAt.current < 250) return;
      lastReactionAt.current = now;
      void channel.send({
        type: "broadcast",
        event: "reaction",
        payload: { emoji, from: userId, to },
      });
    },
    [userId],
  );

  /** Assina reações recebidas; devolve a função para cancelar. */
  const onReaction = useCallback((listener: (r: Reaction) => void) => {
    const listeners = reactionListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  /** Efeito local (não enviado): chuva de emoji, ex.: consenso. */
  const celebrate = useCallback((emoji = "🎉", count = 14) => {
    for (let i = 0; i < count; i++) {
      const reaction: Reaction = {
        id: crypto.randomUUID(),
        emoji,
        from: "",
      };
      setTimeout(
        () => reactionListeners.current.forEach((l) => l(reaction)),
        i * 70,
      );
    }
  }, []);

  const leave = useCallback(async () => {
    if (!room) return;
    await getSupabase().rpc("leave_room", { p_room_id: room.id });
  }, [room]);

  /**
   * Vota (ou troca o voto). `null` retira o voto. A tela muda na hora; os
   * RPCs saem um de cada vez e cliques rápidos se juntam (o último vence), para
   * as requisições não chegarem fora de ordem no banco.
   */
  const vote = useCallback(
    async (value: string | null) => {
      if (!room || !userId) return;
      setState((s) => {
        const votes = { ...s.votes };
        if (value === null) delete votes[userId];
        else votes[userId] = value;
        return { ...s, votes };
      });

      const queue = voteQueue.current;
      queue.next = value;
      if (queue.running) return; // o laço abaixo envia o valor mais recente
      queue.running = true;
      const supabase = getSupabase();
      try {
        while (queue.next !== undefined) {
          const sending = queue.next;
          queue.next = undefined;
          const { error } = await supabase.rpc("cast_vote", {
            p_room_id: room.id,
            // o tipo gerado não sabe que o parâmetro aceita null
            p_value: sending as string,
          });
          if (error) {
            queue.next = undefined;
            // volta para o que o banco tem de fato
            const roundId = currentRoundId.current;
            const { data } = await supabase
              .from("votes")
              .select("value")
              .eq("round_id", roundId ?? "")
              .eq("user_id", userId)
              .maybeSingle();
            setState((s) => {
              if (s.round?.id !== roundId) return s;
              const votes = { ...s.votes };
              if (data) votes[userId] = data.value;
              else delete votes[userId];
              return { ...s, votes };
            });
            throw error;
          }
        }
      } finally {
        queue.running = false;
        announceVote();
      }
    },
    [room, userId, announceVote],
  );

  const reveal = useCallback(async () => {
    if (!room) return;
    const { error } = await getSupabase().rpc("reveal_round", {
      p_room_id: room.id,
    });
    if (error) throw error;
  }, [room]);

  const newRound = useCallback(async () => {
    if (!room) return;
    const { error } = await getSupabase().rpc("new_round", {
      p_room_id: room.id,
    });
    if (error) throw error;
  }, [room]);

  const setTitle = useCallback(
    async (title: string) => {
      if (!room) return;
      const { error } = await getSupabase().rpc("set_round_title", {
        p_room_id: room.id,
        p_title: title,
      });
      if (error) throw error;
    },
    [room],
  );

  // "já votou": lista do banco + meu voto local (aparece sem esperar a rede)
  const peers = useMemo<Peer[]>(() => {
    const voted = new Set(state.voters);
    return state.peers.map((p) => ({
      ...p,
      hasVoted: p.isMe ? myVote !== null : voted.has(p.userId),
    }));
  }, [state.peers, state.voters, myVote]);

  return {
    ...state,
    peers,
    myVote,
    setRole,
    leave,
    sendReaction,
    onReaction,
    celebrate,
    vote,
    reveal,
    newRound,
    setTitle,
  };
}
