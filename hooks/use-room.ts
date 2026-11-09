"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";
import type { Peer, PresenceMeta, Role, Room, Round } from "@/lib/room";
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
  peers: Peer[];
  /** Canal realtime conectado e escutando mudanças do banco. */
  connected: boolean;
};

const INITIAL: RoomState = {
  status: "loading",
  room: null,
  round: null,
  userId: null,
  role: "player",
  peers: [],
  connected: false,
};

/**
 * `channel()` do realtime-js reaproveita canais com o mesmo tópico e a remoção
 * é assíncrona. No StrictMode (dev) o efeito monta duas vezes, então esperamos
 * a remoção anterior terminar antes de criar o canal de novo.
 */
const pendingRemovals = new Map<string, Promise<unknown>>();

function peersFromPresence(
  state: Record<string, PresenceMeta[]>,
  me: string,
): Peer[] {
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
      if (data) update({ round: data });
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
        update({ userId });
        await loadAll(roomId, userId);

        topic = `room:${roomId}`;
        await pendingRemovals.get(topic);
        if (cancelled) return;

        channel = supabase.channel(topic, {
          config: { presence: { key: userId } },
        });
        channelRef.current = channel;

        channel
          .on(
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
          .on("presence", { event: "sync" }, () => {
            const presence = channel!.presenceState<PresenceMeta>();
            update({ peers: peersFromPresence(presence, userId) });
          })
          .on("system", {}, (msg) => {
            // só a partir daqui o postgres_changes está ativo: recarrega para
            // não perder nada que mudou entre o fetch inicial e a assinatura
            if (msg.extension === "postgres_changes" && msg.status === "ok") {
              update({ connected: true });
              void loadAll(roomId, userId);
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              if (presenceRef.current) void channel!.track(presenceRef.current);
            } else {
              update({ connected: false });
            }
          });

        update({ status: "ready" });
      } catch (err) {
        update({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
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

  // ---- Presence: publica meus dados (nome, avatar, papel) ------------------
  const { userId, role, status, room } = state;
  useEffect(() => {
    if (!userId || !profileName) return;
    const meta: PresenceMeta = {
      userId,
      name: profileName,
      avatar: profileAvatar,
      role,
      hasVoted: presenceRef.current?.hasVoted ?? false,
      onlineAt: presenceRef.current?.onlineAt ?? new Date().toISOString(),
    };
    presenceRef.current = meta;
    const channel = channelRef.current;
    if (channel?.state === "joined") void channel.track(meta);
  }, [userId, profileName, profileAvatar, role, state.connected]);

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
      setState((s) => ({ ...s, role: next }));
    },
    [room],
  );

  const leave = useCallback(async () => {
    if (!room) return;
    await getSupabase().rpc("leave_room", { p_room_id: room.id });
  }, [room]);

  return { ...state, setRole, leave };
}
