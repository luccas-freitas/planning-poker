"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCustomEmoji,
  CUSTOM_NAME_RE,
  CustomEmojiError,
  deleteCustomEmoji,
  useCustomEmojis,
} from "@/lib/custom-emojis";
import { ensureSession } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** "Meu Borat.png" → "meu-borat" */
const nameFromFile = (file: File) =>
  file.name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

const errorMessage = (err: unknown) =>
  err instanceof CustomEmojiError ? err.message : "Algo deu errado.";

/** Adicionar (e remover os próprios) emojis personalizados, como no Slack. */
export function CustomEmojiDialog({ open, onOpenChange }: Props) {
  const emojis = useCustomEmojis();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameId = useId();

  useEffect(() => {
    if (open) void ensureSession().then(setUserId);
  }, [open]);

  // prévia local da imagem escolhida (URL blob: liberada ao trocar/fechar)
  const showPreview = (url: string | null) =>
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  useEffect(() => () => showPreview(null), []);

  const reset = () => {
    setFile(null);
    showPreview(null);
    setName("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    showPreview(URL.createObjectURL(f));
    if (!name) setName(nameFromFile(f));
  };

  const validName = CUSTOM_NAME_RE.test(name);
  const taken = emojis.some((e) => e.name === name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !validName || taken) return;
    setBusy(true);
    try {
      await addCustomEmoji(name, file);
      toast.success(`:${name}: adicionado`);
      reset();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(emojiName: string) {
    setRemoving(emojiName);
    try {
      await deleteCustomEmoji(emojiName);
      toast.success(`:${emojiName}: removido`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  }

  const mine = emojis.filter((e) => e.createdBy === userId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar emoji</DialogTitle>
          <DialogDescription>
            Fica disponível para todo mundo que usa o planning poker.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label={file ? "Trocar imagem" : "Escolher imagem"}
              className="border-muted-foreground/40 hover:border-primary focus-visible:ring-ring/50 flex size-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed focus-visible:ring-3 focus-visible:outline-none"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
                <img
                  src={preview}
                  alt="Prévia do emoji"
                  className="size-14 object-contain"
                />
              ) : (
                <ImagePlus className="text-muted-foreground size-7" />
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor={nameId}>Nome</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">:</span>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().slice(0, 32))
                  }
                  placeholder="borat"
                  autoComplete="off"
                  aria-invalid={!!name && (!validName || taken)}
                />
                <span className="text-muted-foreground">:</span>
              </div>
              <p className="text-muted-foreground text-xs">
                {taken
                  ? "Esse nome já existe."
                  : name && !validName
                    ? "Use 2 a 32 letras minúsculas, números, - ou _."
                    : "PNG, JPG, WebP ou GIF. Reduzimos para 128 px."}
              </p>
            </div>
          </div>
          <Button
            type="submit"
            disabled={!file || !validName || taken || busy}
            className="self-end"
          >
            {busy && <Loader2 className="animate-spin" />}
            Adicionar
          </Button>
        </form>

        {mine.length > 0 && (
          <section className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">Seus emojis</h3>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {mine.map((e) => (
                <li key={e.name} className="flex items-center gap-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem pequena do Storage */}
                  <img src={e.url} alt="" className="size-6 object-contain" />
                  <span className="flex-1 truncate">:{e.name}:</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover :${e.name}:`}
                    disabled={removing === e.name}
                    onClick={() => remove(e.name)}
                  >
                    {removing === e.name ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
