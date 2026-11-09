"use client";

import { useSyncExternalStore } from "react";
import { ensureSession, getSupabase } from "./supabase";

/** Emoji personalizado (tabela `custom_emojis`, imagem no bucket `emojis`). */
export type CustomEmoji = { name: string; url: string; createdBy: string };

/** Mesma regra do CHECK no banco. */
export const CUSTOM_NAME_RE = /^[a-z0-9_-]{2,32}$/;
/** Nas reações o emoji personalizado trafega como `:nome:`. */
export const CUSTOM_TOKEN_RE = /^:([a-z0-9_-]{2,32}):$/;

export const customToken = (name: string) => `:${name}:`;
export const customNameFromToken = (token: string) =>
  CUSTOM_TOKEN_RE.exec(token)?.[1] ?? null;

const BUCKET = "emojis";
const OUTPUT_SIZE = 128;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Igual ao `file_size_limit` do bucket. */
const MAX_UPLOAD_BYTES = 256 * 1024;

export class CustomEmojiError extends Error {}

// ---- lista compartilhada (um fetch para a página toda) ----------------------

let emojis: CustomEmoji[] = [];
let loading: Promise<void> | null = null;
let loaded = false;
let lastRefreshAt = 0;
const listeners = new Set<() => void>();

const publicUrl = (path: string) =>
  getSupabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Recarrega a lista do banco (pedidos simultâneos viram um só). */
export function refreshCustomEmojis(): Promise<void> {
  lastRefreshAt = Date.now();
  loading ??= (async () => {
    try {
      await ensureSession();
      const { data } = await getSupabase()
        .from("custom_emojis")
        .select("name, path, created_by")
        .order("name");
      if (data) {
        emojis = data.map((e) => ({
          name: e.name,
          url: publicUrl(e.path),
          createdBy: e.created_by,
        }));
        loaded = true;
        listeners.forEach((l) => l());
      }
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Lista de emojis personalizados; carrega na primeira vez que alguém usa. */
export function useCustomEmojis(): CustomEmoji[] {
  return useSyncExternalStore(
    (l) => {
      if (!loaded) void refreshCustomEmojis();
      return subscribe(l);
    },
    () => emojis,
    () => emojis,
  );
}

/** Procura pelo nome; se não conhece (alguém acabou de criar), recarrega. */
export async function findCustomEmoji(
  name: string,
): Promise<CustomEmoji | undefined> {
  const known = emojis.find((e) => e.name === name);
  if (known) return known;
  // nome desconhecido: recarrega, mas no máx. a cada 5 s (mensagens com nomes
  // inventados não viram uma enxurrada de consultas)
  if (Date.now() - lastRefreshAt < 5_000) return undefined;
  await refreshCustomEmojis();
  return emojis.find((e) => e.name === name);
}

// ---- adicionar / remover -----------------------------------------------------

/**
 * Reduz para caber em 128 px (sem cortar, mantém transparência) em WebP/PNG.
 * GIF vai como está para não perder a animação.
 */
async function prepareImage(file: File): Promise<{ blob: Blob; ext: string }> {
  if (!file.type.startsWith("image/")) {
    throw new CustomEmojiError("Escolha um arquivo de imagem.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new CustomEmojiError("Imagem muito grande (máx. 15 MB).");
  }
  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new CustomEmojiError("GIF muito grande (máx. 256 kB).");
    }
    return { blob: file, ext: "gif" };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new CustomEmojiError(
      "Não consegui ler essa imagem. Tente PNG, JPG, WebP ou GIF.",
    );
  }
  const scale = Math.min(
    1,
    OUTPUT_SIZE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CustomEmojiError("Seu navegador não suporta canvas.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  // sem encoder WebP o navegador devolve PNG (que também guarda transparência)
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  const png = await encode("image/png");
  if (!png) throw new CustomEmojiError("Falha ao processar a imagem.");
  return { blob: png, ext: "png" };
}

const randomSuffix = () =>
  crypto
    .getRandomValues(new Uint32Array(2))
    .reduce((s, n) => s + n.toString(36), "")
    .slice(0, 12);

export async function addCustomEmoji(name: string, file: File): Promise<void> {
  if (!CUSTOM_NAME_RE.test(name)) {
    throw new CustomEmojiError(
      "Use de 2 a 32 letras minúsculas, números, - ou _.",
    );
  }
  if (emojis.some((e) => e.name === name)) {
    throw new CustomEmojiError(`Já existe um emoji :${name}:.`);
  }
  const { blob, ext } = await prepareImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new CustomEmojiError("Imagem muito pesada (máx. 256 kB).");
  }

  const userId = await ensureSession();
  const supabase = getSupabase();
  const path = `${userId}/${name}-${randomSuffix()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type });
  if (uploadError) {
    throw new CustomEmojiError("Falha ao enviar a imagem. Tente novamente.");
  }

  const { error } = await supabase.rpc("add_custom_emoji", {
    p_name: name,
    p_path: path,
  });
  if (error) {
    // não deixa imagem órfã no Storage
    await supabase.storage.from(BUCKET).remove([path]);
    throw new CustomEmojiError(
      error.code === "23505"
        ? `Já existe um emoji :${name}:.`
        : error.code === "54000"
          ? "Limite de emojis atingido (20 por dia por pessoa)."
          : "Não foi possível adicionar o emoji.",
    );
  }
  await refreshCustomEmojis();
}

export async function deleteCustomEmoji(name: string): Promise<void> {
  const supabase = getSupabase();
  const { data: path, error } = await supabase.rpc("delete_custom_emoji", {
    p_name: name,
  });
  if (error || !path) {
    throw new CustomEmojiError("Só quem criou o emoji pode removê-lo.");
  }
  await supabase.storage.from(BUCKET).remove([path]);
  await refreshCustomEmojis();
}
