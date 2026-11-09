"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Link2, Loader2, LogOut, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { ProfileDialog } from "@/components/profile-dialog";
import { ProfileForm } from "@/components/profile-form";
import { ParticipantSeat } from "@/components/room/participant-seat";
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
import { copyText } from "@/lib/room";

export function RoomView({ slug }: { slug: string }) {
  const profile = useProfile();
  const router = useRouter();
  const room = useRoom(slug, profile);

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
        <SeatRow peers={top} />
        <div className="bg-muted/50 flex min-h-36 w-full max-w-2xl flex-col items-center justify-center gap-2 rounded-[2.5rem] border px-6 py-8 text-center">
          {players.length <= 1 ? (
            <>
              <p className="font-medium">Esperando o time chegar…</p>
              <Button variant="link" size="sm" onClick={copyLink}>
                Copiar link de convite
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              {players.length} jogadores na mesa
            </p>
          )}
        </div>
        <SeatRow peers={bottom} />

        {spectators.length > 0 && (
          <section className="text-muted-foreground flex flex-wrap items-center justify-center gap-2 text-sm">
            <Eye className="size-4" /> Assistindo:
            {spectators.map((p) => (
              <span key={p.userId} className="flex items-center gap-1.5">
                <UserAvatar
                  name={p.name}
                  avatar={p.avatar}
                  className="size-6"
                />
                {p.name}
                {p.isMe && " (você)"}
              </span>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function SeatRow({ peers }: { peers: ReturnType<typeof useRoom>["peers"] }) {
  if (peers.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-3 sm:gap-6">
      {peers.map((p) => (
        <ParticipantSeat key={p.userId} peer={p} />
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
