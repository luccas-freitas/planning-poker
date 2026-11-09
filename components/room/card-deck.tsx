"use client";

import { DECK } from "@/lib/deck";
import { cn } from "@/lib/utils";
import { CardCorners } from "./card-corners";

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
      // celular: 2 linhas de 5 cartas (sem rolagem); telas maiores: uma linha
      className="mx-auto grid w-fit grid-cols-5 gap-x-2 gap-y-3 px-1 pt-3 pb-1 sm:flex sm:justify-center sm:gap-2"
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
              "relative flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold transition-all sm:h-20 sm:w-14 sm:text-xl",
              "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isSelected
                ? "poker-selected border-poker-from shadow-poker-from/40 -translate-y-1 text-white shadow-lg sm:-translate-y-2"
                : "border-poker-edge bg-poker-face text-poker-ink enabled:hover:border-poker-from enabled:hover:-translate-y-1 enabled:hover:shadow-md",
            )}
          >
            <CardCorners value={value} />
            {value}
          </button>
        );
      })}
    </div>
  );
}
