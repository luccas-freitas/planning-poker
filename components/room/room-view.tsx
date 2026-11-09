"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  Link2,
  Spade,
  Loader2,
  LogOut,
  RotateCcw,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { ProfileDialog } from "@/components/profile-dialog";
import { ProfileForm } from "@/components/profile-form";
import { CardDeck } from "@/components/room/card-deck";
import { ParticipantSeat } from "@/components/room/participant-seat";
import { ReactionBar } from "@/components/room/reaction-bar";
import { ReactionLayer } from "@/components/room/reaction-layer";
import { ResultsPanel } from "@/components/room/results-panel";
import { RoundTitle } from "@/components/room/round-title";
import { UserAvatar } from "@/components/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRoom } from "@/hooks/use-room";
import { useProfile } from "@/lib/profile";
import { copyText, type Peer } from "@/lib/room";

export function RoomView({ slug }: { slug: string }) {
  const profile = useProfile();
  const router = useRouter();
  const room = useRoom(slug, profile);
  const [busy, setBusy] = useState(false);

  // ---- antes de entrar: carregando / sem perfil / erros --------------------
  if (profile === undefined) return <RoomSkeleton />;

  if (profile === null) {
    return (
      <CenteredCard
        title="Entrar na sala"
        description="Antes, escolha como o time vai te ver. Fica salvo só neste navegador."
      >
        <ProfileForm submitLabel="Entrar na sala" />
      </CenteredCard>
    );
  }

  if (room.status === "not-found") {
    return (
      <CenteredCard
        title="Sala não encontrada"
        description="O link pode estar errado ou a sala expirou (7 dias sem uso)."
      >
        <Link href="/" className={buttonVariants()}>
          Voltar ao início
        </Link>
      </CenteredCard>
    );
  }

  if (room.status === "error") {
    return (
      <CenteredCard
        title="Não foi possível entrar na sala"
        description={room.error ?? "Erro inesperado."}
      >
        <Button onClick={() => window.location.reload()}>Tentar de novo</Button>
      </CenteredCard>
    );
  }

  if (room.status === "loading" || !room.room) return <RoomSkeleton />;

  // ---- sala -----------------------------------------------------------------
  const players = room.peers.filter((p) => p.role === "player");
  const spectators = room.peers.filter((p) => p.role === "spectator");
  const top = players.slice(0, Math.ceil(players.length / 2));
  const bottom = players.slice(Math.ceil(players.length / 2));

  async function copyLink() {
    const ok = await copyText(window.location.href);
    if (ok) toast.success("Link copiado! Envie para o time.");
    else
      toast.error(
        "Não consegui copiar. Copie o endereço da barra do navegador.",
      );
  }

  async function leave() {
    await room.leave();
    router.push("/");
  }

  /** Executa uma ação da rodada com feedback de erro. */
  async function run(action: () => Promise<void>, failMessage: string) {
    setBusy(true);
    try {
      await action();
    } catch {
      toast.error(failMessage);
    } finally {
      setBusy(false);
    }
  }

  function toggleRole() {
    const next = room.role === "player" ? "spectator" : "player";
    void run(() => room.setRole(next), "Não foi possível trocar de papel.");
  }

  const revealed = room.round?.revealed ?? false;
  const votedCount = players.filter((p) => p.hasVoted).length;
  const isPlayer = room.role === "player";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link href="/" className="text-xl" aria-label="Início">
          🃏
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">
            {room.room.name || "Planning Poker"}
          </h1>
          <p className="text-muted-foreground font-mono text-xs">{slug}</p>
        </div>
        {!room.connected && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <WifiOff className="size-3.5" /> Conectando…
          </span>
        )}
        <Button variant="outline" size="sm" onClick={copyLink}>
          <Link2 /> <span className="hidden sm:inline">Convidar</span>
        </Button>
        <RoleToggle
          role={room.role}
          busy={busy}
          onToggle={toggleRole}
          className="hidden sm:inline-flex"
        />
        <ProfileDialog profile={profile} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={leave}
          aria-label="Sair da sala"
        >
          <LogOut />
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        <SeatRow
          peers={top}
          revealed={revealed}
          votes={room.votes}
          onThrow={room.sendReaction}
        />
        <div className="bg-muted/50 flex min-h-40 w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-[2.5rem] border px-6 py-6 text-center">
          <RoundTitle
            title={room.round?.title ?? null}
            onSave={room.setTitle}
          />
          {revealed ? (
            <Button
              size="lg"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(room.newRound, "Não foi possível iniciar nova rodada.")
              }
            >
              <RotateCcw /> Nova rodada
            </Button>
          ) : players.length <= 1 && votedCount === 0 ? (
            <>
              <p className="text-muted-foreground text-sm">
                Esperando o time chegar…
              </p>
              <Button variant="link" size="sm" onClick={copyLink}>
                Copiar link de convite
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {votedCount} de {players.length}{" "}
                {votedCount === 1 ? "votou" : "votaram"}
              </p>
              <Button
                size="lg"
                disabled={busy || votedCount === 0}
                onClick={() =>
                  run(room.reveal, "Não foi possível revelar as cartas.")
                }
              >
                <Sparkles /> Revelar cartas
              </Button>
            </>
          )}
        </div>
        <SeatRow
          peers={bottom}
          revealed={revealed}
          votes={room.votes}
          onThrow={room.sendReaction}
        />

        {spectators.length > 0 && (
          <section className="text-muted-foreground flex flex-wrap items-center justify-center gap-2 text-sm">
            <Eye className="size-4" /> Assistindo:
            {spectators.map((p) => (
              <span key={p.userId} className="flex items-center gap-1.5">
                <span data-seat={p.userId} className="rounded-full">
                  <UserAvatar
                    name={p.name}
                    avatar={p.avatar}
                    className="size-6"
                  />
                </span>
                {p.name}
                {p.isMe && " (você)"}
              </span>
            ))}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <ReactionBar
            onReact={(emoji) => room.sendReaction(emoji)}
            className="bg-muted/50 rounded-full border px-1.5 py-0.5"
          />
          <RoleToggle
            role={room.role}
            busy={busy}
            onToggle={toggleRole}
            className="sm:hidden"
          />
        </div>
      </main>

      <ReactionLayer subscribe={room.onReaction} />

      <footer className="bg-background/95 sticky bottom-0 border-t px-4 pt-2 pb-4 backdrop-blur">
        {revealed ? (
          <ResultsPanel
            onConsensus={() => room.celebrate()}
            votes={room.votes}
            names={{
              ...room.members,
              // quem está online tem o nome mais recente
              ...Object.fromEntries(
                room.peers.map((p) => [
                  p.userId,
                  { name: p.name, avatar: p.avatar },
                ]),
              ),
            }}
          />
        ) : isPlayer ? (
          <>
            <p className="text-muted-foreground text-center text-sm">
              {room.myVote
                ? "Voto registrado. Você pode trocar até revelar."
                : "Escolha sua carta 👇"}
            </p>
            <CardDeck
              selected={room.myVote}
              onSelect={(value) =>
                room
                  .vote(value)
                  .catch(() =>
                    toast.error("Não foi possível registrar o voto."),
                  )
              }
            />
          </>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            <Eye className="mr-1 inline size-4" /> Você está assistindo.
          </p>
        )}
      </footer>
    </div>
  );
}

function RoleToggle({
  role,
  busy,
  onToggle,
  className,
}: {
  role: "player" | "spectator";
  busy: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const isPlayer = role === "player";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onToggle}
      className={className}
      title={isPlayer ? "Só assistir, sem votar" : "Voltar a votar"}
    >
      {isPlayer ? <Eye /> : <Spade />}
      {isPlayer ? "Assistir" : "Jogar"}
    </Button>
  );
}

function SeatRow({
  peers,
  revealed,
  votes,
  onThrow,
}: {
  peers: Peer[];
  revealed: boolean;
  votes: Record<string, string>;
  onThrow: (emoji: string, to: string) => void;
}) {
  if (peers.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-3 sm:gap-6">
      {peers.map((p) => (
        <ParticipantSeat
          key={p.userId}
          peer={p}
          revealed={revealed}
          vote={votes[p.userId]}
          onThrow={onThrow}
        />
      ))}
    </div>
  );
}

function CenteredCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

export function RoomSkeleton() {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center">
      <Loader2 className="mr-2 size-5 animate-spin" /> Entrando na sala…
    </div>
  );
}
