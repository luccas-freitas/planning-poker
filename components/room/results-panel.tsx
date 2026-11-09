"use client";

import { useEffect, useMemo } from "react";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { MessagesSquare, PartyPopper } from "lucide-react";
import type { Member } from "@/hooks/use-room";
import { computeStats, formatNumber, type Bucket } from "@/lib/stats";

type Props = {
  votes: Record<string, string>;
  /** Nomes por user_id (participantes da sala + quem está online). */
  names: Record<string, Member>;
  /** Chamado uma vez ao montar se houve consenso (ex.: chuva de 🎉). */
  onConsensus?: () => void;
};

const nameOf = (names: Props["names"], id: string) =>
  names[id]?.name ?? "Alguém";

/** Resultado da rodada revelada: distribuição, média, mediana e consenso. */
export function ResultsPanel({ votes, names, onConsensus }: Props) {
  const stats = useMemo(
    () =>
      computeStats(
        Object.entries(votes).map(([userId, value]) => ({ userId, value })),
      ),
    [votes],
  );

  // comemora uma vez por rodada (o painel monta a cada reveal)
  const consensus = stats.consensus;
  useEffect(() => {
    if (consensus) onConsensus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consensus]);

  if (stats.total === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Ninguém votou nesta rodada.
      </p>
    );
  }

  const listVoters = (b: Bucket) =>
    b.voters.map((id) => nameOf(names, id)).join(", ");

  return (
    <section
      aria-label="Resultado da rodada"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:items-center"
    >
      {/* Gráfico: uma série → uma cor, sem legenda; valores no topo das barras */}
      <div className="h-36 w-full min-w-0 sm:flex-1" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stats.distribution}
            margin={{ top: 20, right: 8, bottom: 0, left: 8 }}
          >
            <XAxis
              dataKey="value"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => (
                <VoteTooltip
                  active={active}
                  bucket={payload?.[0]?.payload as Bucket | undefined}
                  names={names}
                />
              )}
            />
            <Bar
              dataKey="count"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive
            >
              <LabelList
                dataKey="count"
                position="top"
                fill="var(--foreground)"
                fontSize={13}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Alternativa em texto para leitores de tela */}
      <ul className="sr-only">
        {stats.distribution.map((b) => (
          <li key={b.value}>
            Carta {b.value}: {b.count} {b.count === 1 ? "voto" : "votos"} (
            {listVoters(b)})
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:w-64">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Média" value={formatNumber(stats.average)} />
          <Stat label="Mediana" value={formatNumber(stats.median)} />
          <Stat label="Sugestão" value={stats.suggestion ?? "—"} highlight />
        </dl>

        {stats.consensus ? (
          <p className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <PartyPopper className="size-4" /> Consenso! Todos votaram{" "}
            {stats.distribution[0].value}.
          </p>
        ) : stats.divergence ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <MessagesSquare className="mt-0.5 size-4 shrink-0" />
            <span>
              Votos bem diferentes. Que tal ouvir{" "}
              <strong>{listVoters(stats.divergence.low)}</strong> (
              {stats.divergence.low.value}) e{" "}
              <strong>{listVoters(stats.divergence.high)}</strong> (
              {stats.divergence.high.value})?
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-center text-sm">
            {stats.total} {stats.total === 1 ? "voto" : "votos"}
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "bg-primary text-primary-foreground rounded-lg px-2 py-1.5"
          : "bg-muted rounded-lg px-2 py-1.5"
      }
    >
      <dt className="text-[11px] opacity-80">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function VoteTooltip({
  active,
  bucket,
  names,
}: {
  active?: boolean;
  bucket?: Bucket;
  names: Props["names"];
}) {
  if (!active || !bucket) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-sm shadow-md">
      <p>
        <strong className="tabular-nums">{bucket.count}</strong>{" "}
        <span className="text-muted-foreground">
          {bucket.count === 1 ? "voto" : "votos"} em {bucket.value}
        </span>
      </p>
      <p className="text-muted-foreground max-w-56 text-xs">
        {bucket.voters.map((id) => nameOf(names, id)).join(", ")}
      </p>
    </div>
  );
}
