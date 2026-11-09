"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Categories } from "emoji-picker-react";
import { Plus, SmilePlus, Sparkles } from "lucide-react";
import { CustomEmojiDialog } from "@/components/room/custom-emoji-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { customToken, useCustomEmojis } from "@/lib/custom-emojis";
import { cn } from "@/lib/utils";

// carregado só ao abrir: o seletor e os dados dos emojis pesam ~300 kB
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-[380px] w-[320px] items-center justify-center text-sm">
      Carregando emojis…
    </div>
  ),
});

// busca em português (palavras-chave do dataset pt)
const loadPortuguese = () => import("emoji-picker-react/data/emojis-pt");

// nomes das categorias (o dataset capitaliza tudo: "Pessoas E Corpo")
const CATEGORIES = [
  ["suggested", "Mais usados"],
  ["custom", "Personalizados"],
  ["smileys_people", "Rostos e pessoas"],
  ["animals_nature", "Animais e natureza"],
  ["food_drink", "Comidas e bebidas"],
  ["travel_places", "Viagens e lugares"],
  ["activities", "Atividades"],
  ["objects", "Objetos"],
  ["symbols", "Símbolos"],
  ["flags", "Bandeiras"],
] as const;
const categories = CATEGORIES.map(([category, name]) => ({
  category: category as Categories,
  name,
  // ícone próprio para a aba dos personalizados
  ...(category === "custom" && { icon: <Sparkles className="size-4" /> }),
}));

type Props = {
  onPick: (emoji: string) => void;
  /** Rótulo acessível do botão "+". */
  label?: string;
  className?: string;
};

/** Botão "+" que abre o seletor completo de emojis (busca, categorias, recentes). */
export function EmojiPickerButton({
  onPick,
  label = "Mais emojis",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const custom = useCustomEmojis();
  const customEmojis = useMemo(
    () => custom.map((e) => ({ id: e.name, names: [e.name], imgUrl: e.url })),
    [custom],
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={label}
          title={label}
          className={cn(
            "hover:bg-muted focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground rounded-full p-1.5 transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:outline-none",
            className,
          )}
        >
          <SmilePlus className="size-5" />
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto overflow-hidden p-0">
          <EmojiPicker
            onEmojiClick={(e) =>
              // personalizado trafega como `:nome:` (o id é o nome)
              onPick(e.isCustom ? customToken(e.unified) : e.emoji)
            }
            customEmojis={customEmojis}
            emojiStyle="native"
            colorScheme="auto"
            emojiData={loadPortuguese}
            categories={categories}
            className="pp-emoji-picker"
            width={320}
            height={380}
            lazyLoadEmojis
            autoFocusSearch
            previewConfig={{ showPreview: false }}
            labels={{
              searchPlaceholder: "Buscar",
              searchLabel: "Buscar emoji",
              searchClear: "Limpar busca",
              searchResultsNone: "Nenhum emoji encontrado",
              searchResultsOne: "1 emoji encontrado",
              searchResultsMany: "%n emojis encontrados",
              categoryNavigation: "Categorias",
              loading: "Carregando emojis…",
              loadingError: "Não foi possível carregar os emojis",
              retryLoading: "Tentar de novo",
            }}
            style={
              {
                "--epr-bg-color": "var(--popover)",
                "--epr-category-label-bg-color": "var(--popover)",
                "--epr-search-input-bg-color": "var(--muted)",
                "--epr-hover-bg-color": "var(--muted)",
                "--epr-focus-bg-color": "var(--muted)",
                "--epr-highlight-color": "var(--primary)",
                "--epr-text-color": "var(--popover-foreground)",
                "--epr-search-border-color": "var(--primary)",
                border: "none",
                borderRadius: 0,
              } as React.CSSProperties
            }
          />
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm focus-visible:ring-3 focus-visible:outline-none"
            >
              <Plus className="size-4" /> Adicionar emoji
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <CustomEmojiDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
