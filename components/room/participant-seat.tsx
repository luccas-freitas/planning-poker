"use client";

import { UserAvatar } from "@/components/user-avatar";
import type { Peer } from "@/lib/room";
import { cn } from "@/lib/utils";

/** Um jogador na mesa: carta (virada/vazia), avatar e nome. */
export function ParticipantSeat({ peer }: { peer: Peer }) {
  return (
    <div className="flex w-20 flex-col items-center gap-1.5 sm:w-24">
      <div
        aria-label={peer.hasVoted ? "Já votou" : "Ainda não votou"}
        className={cn(
          "h-14 w-10 rounded-md border-2 transition-colors sm:h-16 sm:w-11",
          peer.hasVoted
            ? "border-primary bg-primary shadow-md"
            : "border-muted-foreground/30 border-dashed",
        )}
      />
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
