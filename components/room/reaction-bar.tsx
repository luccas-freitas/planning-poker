"use client";

import { EmojiPickerButton } from "@/components/room/emoji-picker-button";
import { REACTIONS } from "@/lib/room";
import { cn } from "@/lib/utils";

type Props = {
  onReact: (emoji: string) => void;
  className?: string;
  /** Rótulo acessível de cada botão, ex.: (e) => `Reagir com ${e}`. */
  label?: (emoji: string) => string;
  /** Rótulo do botão "+" que abre o seletor completo. */
  moreLabel?: string;
};

export function ReactionBar({
  onReact,
  className,
  label = (e) => `Reagir com ${e}`,
  moreLabel,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Reações"
      className={cn("flex items-center gap-0.5", className)}
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={label(emoji)}
          onClick={() => onReact(emoji)}
          className="hover:bg-muted focus-visible:ring-ring/50 rounded-full p-1.5 text-xl leading-none transition-transform hover:scale-125 focus-visible:ring-3 focus-visible:outline-none active:scale-90"
        >
          {emoji}
        </button>
      ))}
      <EmojiPickerButton onPick={onReact} label={moreLabel} />
    </div>
  );
}
