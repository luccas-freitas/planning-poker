"use client";

import { ensureSession, getSupabase } from "./supabase";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const OUTPUT_SIZE = 256;

export class AvatarUploadError extends Error {}

/** Recorta no centro (quadrado), redimensiona para 256px e converte para WebP. */
async function toSquareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new AvatarUploadError("Escolha um arquivo de imagem.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarUploadError("Imagem muito grande (máx. 15 MB).");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarUploadError(
      "Não consegui ler essa imagem. Tente JPG, PNG ou WebP.",
    );
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AvatarUploadError("Seu navegador não suporta canvas.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));

  // navegadores sem encoder WebP devolvem PNG; nesse caso usamos JPEG
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new AvatarUploadError("Falha ao processar a imagem.");
  return jpeg;
}

/**
 * Processa e envia a foto para `avatars/<user_id>/avatar`, substituindo a
 * anterior. Devolve a URL pública (com cache-buster).
 */
export async function uploadAvatar(file: File): Promise<string> {
  const image = await toSquareImage(file);
  const userId = await ensureSession();
  const supabase = getSupabase();
  const path = `${userId}/avatar`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, image, { upsert: true, contentType: image.type });
  if (error) {
    throw new AvatarUploadError("Falha ao enviar a foto. Tente novamente.");
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
