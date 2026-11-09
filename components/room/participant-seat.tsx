"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ReactionBar } from "@/components/room/reaction-bar";
import { UserAvatar } from "@/components/user-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Peer } from "@/lib/room";
import { cn } from "@/lib/utils";

type Props = {
  peer: Peer;
  revealed: boolean;
  /** Valor do voto (conhecido após o reveal). */
  vote: string | undefined;
  /** Arremessa um emoji neste participante. */
  onThrow: (emoji: string, to: string) => void;
};

/** Um jogador na mesa: carta (vazia, virada ou revelada), avatar e nome. */
export function ParticipantSeat({ peer, revealed, vote, onThrow }: Props) {
  const reduceMotion = useReducedMotion();
  const showValue = revealed && vote !== undefined;
  const cardState = showValue ? "front" : peer.hasVoted ? "back" : "empty";
  const label = showValue
    ? `Votou ${vote}`
    : peer.hasVoted
      ? "Já votou"
      : revealed
        ? "Não votou"
        : "Ainda não votou";

  const avatar = (
    <UserAvatar
      name={peer.name}
      avatar={peer.avatar}
      className={cn(
        "size-10 sm:size-12",
        peer.isMe && "ring-primary ring-offset-background ring-2 ring-offset-2",
      )}
    />
  );

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex w-20 flex-col items-center gap-1.5 sm:w-24"
    >
      <div
        className="h-14 w-10 [perspective:400px] sm:h-16 sm:w-11"
        aria-label={label}
        title={label}
        role="img"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={cardState}
            // virada da carta: gira no eixo Y ao mudar de estado
            initial={reduceMotion ? false : { rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={reduceMotion ? undefined : { rotateY: -90 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "flex size-full items-center justify-center rounded-md border-2 text-lg font-bold",
              cardState === "front" &&
                "border-poker-from bg-poker-face text-poker-ink shadow-md",
              cardState === "back" && "poker-back border-poker-to shadow-md",
              cardState === "empty" &&
                "border-muted-foreground/30 border-dashed",
            )}
          >
            {showValue && vote}
          </motion.div>
        </AnimatePresence>
      </div>

      <div data-seat={peer.userId} className="rounded-full">
        {peer.isMe ? (
          avatar
        ) : (
          <Popover>
            <PopoverTrigger
              aria-label={`Jogar um emoji em ${peer.name}`}
              title={`Jogar um emoji em ${peer.name}`}
              className="focus-visible:ring-ring/50 cursor-pointer rounded-full transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:outline-none"
            >
              {avatar}
            </PopoverTrigger>
            <PopoverContent side="top" className="w-auto p-1">
              <ReactionBar
                onReact={(emoji) => onThrow(emoji, peer.userId)}
                label={(e) => `Jogar ${e} em ${peer.name}`}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <span
        className="w-full truncate text-center text-xs font-medium sm:text-sm"
        title={peer.name}
      >
        {peer.name}
      </span>
      {peer.isMe && (
        <span className="text-muted-foreground -mt-1.5 text-[11px]">você</span>
      )}
    </motion.div>
  );
}
