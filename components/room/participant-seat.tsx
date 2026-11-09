"use client";

import { UserAvatar } from "@/components/user-avatar";
import type { Peer } from "@/lib/room";
import { cn } from "@/lib/utils";

type Props = {
  peer: Peer;
  revealed: boolean;
  /** Valor do voto (conhecido após o reveal). */
  vote: string | undefined;
};

/** Um jogador na mesa: carta (vazia, virada ou revelada), avatar e nome. */
export function ParticipantSeat({ peer, revealed, vote }: Props) {
  const showValue = revealed && vote !== undefined;
  const label = showValue
    ? `Votou ${vote}`
    : peer.hasVoted
      ? "Já votou"
      : revealed
        ? "Não votou"
        : "Ainda não votou";

  return (
    <div className="flex w-20 flex-col items-center gap-1.5 sm:w-24">
      <div
        aria-label={label}
        title={label}
        className={cn(
          "flex h-14 w-10 items-center justify-center rounded-md border-2 text-lg font-bold transition-all duration-300 sm:h-16 sm:w-11",
          showValue
            ? "border-primary bg-card text-primary shadow-md"
            : peer.hasVoted
              ? "border-primary bg-primary shadow-md"
              : "border-muted-foreground/30 border-dashed",
        )}
      >
        {showValue && vote}
      </div>
      <UserAvatar
        name={peer.name}
        avatar={peer.avatar}
        className={cn(
          "size-10 sm:size-12",
          peer.isMe &&
            "ring-primary ring-offset-background ring-2 ring-offset-2",
        )}
      />
      <span
        className="w-full truncate text-center text-xs font-medium sm:text-sm"
        title={peer.name}
      >
        {peer.name}
      </span>
      {peer.isMe && (
        <span className="text-muted-foreground -mt-1.5 text-[11px]">você</span>
      )}
    </div>
  );
}
