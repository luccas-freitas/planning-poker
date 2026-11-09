import { DECK, isNumericCard } from "./deck";

export type Vote = { userId: string; value: string };

export type Bucket = { value: string; count: number; voters: string[] };

export type VoteStats = {
  total: number;
  /** Só as cartas que receberam votos, na ordem do deck. */
  distribution: Bucket[];
  /** Estatísticas numéricas (ignoram `?` e `☕`); null se não houver números. */
  average: number | null;
  median: number | null;
  /** Carta do deck mais próxima da média (empate → a maior). */
  suggestion: string | null;
  /** Todos votaram a mesma carta numérica (com pelo menos 2 votos). */
  consensus: boolean;
  /**
   * Votos numéricos distantes 3+ posições no deck (ex.: 3 e 13): vale a pena
   * quem votou nos extremos explicar o raciocínio.
   */
  divergence: { low: Bucket; high: Bucket } | null;
};

const NUMERIC_DECK = DECK.filter(isNumericCard);
const DIVERGENCE_STEPS = 3;

export function computeStats(votes: Vote[]): VoteStats {
  const distribution = DECK.map((value) => {
    const voters = votes.filter((v) => v.value === value).map((v) => v.userId);
    return { value, count: voters.length, voters };
  }).filter((b) => b.count > 0);

  const numbers = votes
    .filter((v) => isNumericCard(v.value))
    .map((v) => Number(v.value))
    .sort((a, b) => a - b);

  let average: number | null = null;
  let median: number | null = null;
  let suggestion: string | null = null;

  if (numbers.length > 0) {
    average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const mid = Math.floor(numbers.length / 2);
    median =
      numbers.length % 2 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
    suggestion = NUMERIC_DECK.reduce((best, card) =>
      Math.abs(Number(card) - average!) <= Math.abs(Number(best) - average!)
        ? card
        : best,
    );
  }

  const numericBuckets = distribution.filter((b) => isNumericCard(b.value));
  let divergence: VoteStats["divergence"] = null;
  if (numericBuckets.length >= 2) {
    const low = numericBuckets[0];
    const high = numericBuckets[numericBuckets.length - 1];
    const steps =
      NUMERIC_DECK.indexOf(high.value as (typeof NUMERIC_DECK)[number]) -
      NUMERIC_DECK.indexOf(low.value as (typeof NUMERIC_DECK)[number]);
    if (steps >= DIVERGENCE_STEPS) divergence = { low, high };
  }

  return {
    total: votes.length,
    distribution,
    average,
    median,
    suggestion,
    consensus:
      votes.length >= 2 &&
      distribution.length === 1 &&
      isNumericCard(distribution[0].value),
    divergence,
  };
}

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export const formatNumber = (n: number | null) =>
  n === null ? "—" : numberFormat.format(n);
