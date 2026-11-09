"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient<Database> | null = null;

/** Cliente único do Supabase no navegador (sessão salva no localStorage). */
export function getSupabase(): SupabaseClient<Database> {
  if (!url || !key) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local",
    );
  }
  client ??= createClient<Database>(url, key);
  return client;
}

/**
 * Garante uma sessão anônima (invisível para o usuário).
 * Reaproveita a sessão existente; cria uma nova só na primeira visita.
 */
export async function ensureSession(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user)
    throw error ?? new Error("Falha ao criar sessão anônima");
  return signIn.user.id;
}
