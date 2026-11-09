import { createAvatar, type Style } from "@dicebear/core";
import {
  adventurer,
  bigSmile,
  bottts,
  funEmoji,
  lorelei,
  notionists,
  pixelArt,
  thumbs,
} from "@dicebear/collection";

/**
 * Estilos de avatar pronto. As chaves vão no banco no formato
 * `dicebear:<estilo>:<seed>` e precisam bater com o CHECK de
 * `participants.avatar_url` (kebab-case minúsculo).
 */
export const AVATAR_STYLES = {
  "fun-emoji": funEmoji,
  adventurer,
  bottts,
  lorelei,
  notionists,
  "pixel-art": pixelArt,
  "big-smile": bigSmile,
  thumbs,
} as const;

export type AvatarStyle = keyof typeof AVATAR_STYLES;

const STYLE_KEYS = Object.keys(AVATAR_STYLES) as AvatarStyle[];
const PRESET_RE = /^dicebear:([a-z-]+):([A-Za-z0-9_-]{1,64})$/;

export const presetAvatar = (style: AvatarStyle, seed: string) =>
  `dicebear:${style}:${seed}`;

export const isUploadedAvatar = (avatar: string | null | undefined) =>
  !!avatar && /^https?:\/\//.test(avatar);

export function randomSeed(length = 8): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** `n` avatares prontos, alternando os estilos, com seeds aleatórias. */
export function randomPresets(n = 12): string[] {
  return Array.from({ length: n }, (_, i) =>
    presetAvatar(STYLE_KEYS[i % STYLE_KEYS.length], randomSeed()),
  );
}

const cache = new Map<string, string>();

/** Converte o valor salvo (preset ou URL) em `src` de imagem. */
export function avatarSrc(avatar: string | null | undefined) {
  if (!avatar) return undefined;
  if (isUploadedAvatar(avatar)) return avatar;

  const cached = cache.get(avatar);
  if (cached) return cached;

  const match = PRESET_RE.exec(avatar);
  const style = match && AVATAR_STYLES[match[1] as AvatarStyle];
  if (!match || !style) return undefined;

  // os estilos têm opções incompatíveis entre si; aqui só usamos `seed`
  const uri = createAvatar(style as Style<object>, {
    seed: match[2],
  }).toDataUri();
  cache.set(avatar, uri);
  return uri;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
