"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { customNameFromToken, findCustomEmoji } from "@/lib/custom-emojis";
import type { Reaction } from "@/lib/room";

const MAX_ON_SCREEN = 40;

type Point = { x: number; y: number };

type Flying = {
  id: string;
  emoji: string;
  /** Imagem do emoji personalizado (URL vinda da nossa tabela). */
  imageUrl?: string;
  from: Point;
  /** Destino (arremesso) ou subida a partir de `from`. */
  to: Point | null;
  /** Desvio horizontal e altura da subida (sorteados ao receber). */
  drift: number;
  rise: number;
};

/** Centro do avatar do participante na tela (atributo `data-seat`). */
function seatCenter(userId: string | undefined): Point | null {
  if (!userId) return null;
  // compara via dataset (sem montar seletor com dado vindo da rede)
  const el = Array.from(
    document.querySelectorAll<HTMLElement>("[data-seat]"),
  ).find((e) => e.dataset.seat === userId);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function randomBottom(): Point {
  return {
    x: window.innerWidth * (0.15 + Math.random() * 0.7),
    y: window.innerHeight - 40,
  };
}

type Props = {
  subscribe: (listener: (r: Reaction) => void) => () => void;
};

/** Camada fixa por cima da sala onde as reações voam. */
export function ReactionLayer({ subscribe }: Props) {
  const [flying, setFlying] = useState<Flying[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(
    () =>
      subscribe(async (r) => {
        // personalizado: só mostra se existir na tabela (nome desconhecido some)
        const customName = customNameFromToken(r.emoji);
        const custom = customName ? await findCustomEmoji(customName) : null;
        if (customName && !custom) return;

        const from = seatCenter(r.from) ?? randomBottom();
        const to = seatCenter(r.to);
        setFlying((list) =>
          [
            ...list,
            {
              id: r.id,
              emoji: r.emoji,
              imageUrl: custom?.url,
              from,
              to,
              drift: (Math.random() - 0.5) * 80,
              rise: 160 + Math.random() * 80,
            },
          ].slice(-MAX_ON_SCREEN),
        );
      }),
    [subscribe],
  );

  const remove = (id: string) =>
    setFlying((list) => list.filter((f) => f.id !== id));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      <AnimatePresence>
        {flying.map((f) => {
          const animate = reduceMotion
            ? { opacity: [0, 1, 1, 0], scale: 1 }
            : f.to
              ? {
                  // arremesso: voa até o alvo, quica e some
                  x: [f.from.x, f.to.x, f.to.x],
                  y: [f.from.y, f.to.y - 10, f.to.y],
                  scale: [0.6, 1.4, 0],
                  rotate: [0, 360, 360],
                  opacity: [1, 1, 0],
                }
              : {
                  // sobe a partir do remetente
                  x: [f.from.x, f.from.x + f.drift],
                  y: [f.from.y, f.from.y - f.rise],
                  scale: [0.6, 1.3, 1],
                  opacity: [0, 1, 0],
                };
          return (
            <motion.span
              key={f.id}
              className="absolute top-0 left-0 -translate-1/2 text-3xl select-none"
              // ponto de partida explícito (initial={false} renderizaria
              // direto no fim do caminho)
              initial={
                reduceMotion
                  ? { x: (f.to ?? f.from).x, y: (f.to ?? f.from).y, opacity: 0 }
                  : { x: f.from.x, y: f.from.y, opacity: 0, scale: 0.6 }
              }
              animate={animate}
              transition={{
                duration: f.to ? 0.9 : 1.8,
                ease: "easeOut",
                times: f.to ? [0, 0.7, 1] : undefined,
              }}
              onAnimationComplete={() => remove(f.id)}
            >
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagem pequena do Storage, sem otimização
                <img
                  src={f.imageUrl}
                  alt=""
                  draggable={false}
                  className="size-9 object-contain"
                />
              ) : (
                f.emoji
              )}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
