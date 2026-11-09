"use client";

import { useState } from "react";
import { toast } from "sonner";

const TITLE_MAX = 200; // precisa bater com o CHECK de rounds.title

type Props = {
  title: string | null;
  onSave: (title: string) => Promise<void>;
};

/** Título da rodada, editável por qualquer participante (salva ao sair do campo). */
export function RoundTitle({ title, onSave }: Props) {
  // enquanto edita, guarda o rascunho; fora disso mostra o valor do servidor
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? title ?? "";

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === (title ?? "")) return;
    try {
      await onSave(next);
    } catch {
      toast.error("Não foi possível salvar o título.");
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      maxLength={TITLE_MAX}
      placeholder="Sobre o que estamos votando? (opcional)"
      aria-label="Título da rodada"
      className="placeholder:text-muted-foreground hover:bg-background/50 focus:bg-background focus:ring-ring/50 w-full max-w-md rounded-md bg-transparent px-2 py-1 text-center font-medium outline-none placeholder:font-normal focus:ring-2"
    />
  );
}
