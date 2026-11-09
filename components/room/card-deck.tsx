"use client";

import { DECK } from "@/lib/deck";
import { cn } from "@/lib/utils";

type Props = {
  selected: string | null;
  disabled?: boolean;
  onSelect: (value: string | null) => void;
};

/** Leque de cartas do jogador. Clicar na carta escolhida retira o voto. */
export function CardDeck({ selected, disabled, onSelect }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Suas cartas"
      className="flex max-w-full gap-2 overflow-x-auto px-1 pt-3 pb-1 sm:justify-center"
    >
      {DECK.map((value) => {
        const isSelected = value === selected;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`Carta ${value}`}
            disabled={disabled}
            onClick={() => onSelect(isSelected ? null : value)}
            className={cn(
              "flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold transition-all sm:h-20 sm:w-14 sm:text-xl",
              "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isSelected
                ? "border-primary bg-primary text-primary-foreground -translate-y-2 shadow-lg"
                : "border-primary/40 bg-card text-primary enabled:hover:border-primary enabled:hover:-translate-y-1",
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
