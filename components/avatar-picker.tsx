"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { avatarSrc, isUploadedAvatar, randomPresets } from "@/lib/avatar";
import { AvatarUploadError, uploadAvatar } from "@/lib/avatar-upload";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (avatar: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

export function AvatarPicker({ value, onChange, onUploadingChange }: Props) {
  const [presets, setPresets] = useState(() => randomPresets(12));
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      onChange(await uploadAvatar(file));
      toast.success("Foto enviada!");
    } catch (err) {
      toast.error(
        err instanceof AvatarUploadError
          ? err.message
          : "Falha ao enviar a foto. O servidor está no ar?",
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Avatares prontos"
        className="grid grid-cols-4 gap-2 sm:grid-cols-6"
      >
        {presets.map((preset) => {
          const selected = preset === value;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label="Escolher este avatar"
              onClick={() => onChange(preset)}
              className={cn(
                "bg-muted aspect-square overflow-hidden rounded-full border-2 transition",
                "focus-visible:ring-ring/50 hover:scale-105 focus-visible:ring-3 focus-visible:outline-none",
                selected
                  ? "border-primary ring-primary/30 ring-2"
                  : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG local */}
              <img src={avatarSrc(preset)} alt="" className="size-full" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPresets(randomPresets(12))}
        >
          <Shuffle /> Outras opções
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
          {uploading ? "Enviando…" : "Enviar foto"}
        </Button>
        {isUploadedAvatar(value) && (
          <span className="text-muted-foreground self-center text-xs">
            Usando sua foto
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
