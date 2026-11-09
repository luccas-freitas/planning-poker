import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

export type Room = Pick<
  Tables["rooms"]["Row"],
  "id" | "slug" | "name" | "current_round_id"
>;
export type Round = Tables["rounds"]["Row"];
export type Role = "player" | "spectator";

/** Payload publicado na Presence de cada participante online. */
export type PresenceMeta = {
  userId: string;
  name: string;
  avatar: string | null;
  role: Role;
  onlineAt: string;
};

/**
 * Participante online. `hasVoted` não vem do Presence (o Supabase limita a 5
 * atualizações de Presence por cliente a cada 30 s); vem de `round_voters`.
 */
export type Peer = PresenceMeta & { isMe: boolean; hasVoted: boolean };

/** Precisa bater com o CHECK de `rooms.slug`. */
const SLUG_RE = /[a-z0-9]{12}/;

/** Extrai o código da sala de um link completo ou do próprio código. */
export function parseRoomInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  const fromPath = /\/r\/([a-z0-9]{12})(?:[/?#]|$)/.exec(text)?.[1];
  if (fromPath) return fromPath;
  return SLUG_RE.test(text) && text.length === 12 ? text : null;
}

export const roomPath = (slug: string) => `/r/${slug}`;

/** Copia texto, com fallback para contextos sem Clipboard API (http em IP da rede). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      return document.execCommand("copy");
    } finally {
      el.remove();
    }
  }
}

/** Emojis de reação permitidos (o que chega fora da lista é ignorado). */
/** Atalhos da barra de reações; o seletor "+" libera todos os emojis. */
export const REACTIONS = [
  "👍",
  "🎉",
  "😂",
  "🤔",
  "🔥",
  "👏",
  "😱",
  "☕",
] as const;

export type Reaction = {
  id: string;
  emoji: string;
  from: string;
  /** Alvo (emoji "arremessado" em alguém) ou ausente (flutua do remetente). */
  to?: string;
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/**
 * Aceita exatamente um emoji (qualquer um, inclusive com tom de pele, ZWJ ou
 * bandeira): um único grafema curto que contenha um pictograma.
 */
export const isReactionEmoji = (e: unknown): e is string =>
  typeof e === "string" &&
  e.length > 0 &&
  e.length <= 32 &&
  EMOJI_PART.test(e) &&
  [...graphemes.segment(e)].length === 1;
