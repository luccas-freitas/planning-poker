"use client";

import { useSyncExternalStore } from "react";

/** Perfil local do usuário (nome + avatar), salvo só no navegador. */
export type Profile = {
  name: string;
  /** `dicebear:<estilo>:<seed>` ou URL de foto enviada. */
  avatar: string | null;
};

/** Precisa bater com o CHECK de `participants.display_name`. */
export const NAME_MAX = 40;

const KEY = "planning-poker:profile";
const listeners = new Set<() => void>();

let lastRaw: string | null | undefined;
let lastProfile: Profile | null = null;

function parse(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name || name.length > NAME_MAX) return null;
    return { name, avatar: typeof p.avatar === "string" ? p.avatar : null };
  } catch {
    return null;
  }
}

function getSnapshot(): Profile | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // modo privado / storage bloqueado: segue sem perfil salvo
  }
  // mantém a mesma referência enquanto o conteúdo não muda
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastProfile = parse(raw);
  }
  return lastProfile;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // sincroniza entre abas
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function saveProfile(profile: Profile) {
  const clean: Profile = {
    name: profile.name.trim().slice(0, NAME_MAX),
    avatar: profile.avatar,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // sem storage: o perfil vale só para esta aba
    lastRaw = JSON.stringify(clean);
    lastProfile = clean;
  }
  listeners.forEach((l) => l());
}

/**
 * `undefined` = carregando (render no servidor / hidratação),
 * `null` = sem perfil, ou o perfil salvo.
 */
export function useProfile(): Profile | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
