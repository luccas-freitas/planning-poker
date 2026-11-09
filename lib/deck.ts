/** Deck Fibonacci. Precisa bater com o CHECK de `votes.value` no banco. */
export const DECK = [
  "0",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "21",
  "?",
  "☕",
] as const;

export type CardValue = (typeof DECK)[number];

/** Cartas que entram nas estatísticas (média/mediana). */
export const isNumericCard = (v: string): boolean => /^\d+$/.test(v);
