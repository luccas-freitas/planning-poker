"use client";

import { useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presetAvatar, randomSeed } from "@/lib/avatar";
import { NAME_MAX, saveProfile, type Profile } from "@/lib/profile";

type Props = {
  initial?: Profile | null;
  submitLabel?: string;
  onSaved?: (profile: Profile) => void;
  onCancel?: () => void;
};

export function ProfileForm({
  initial,
  submitLabel = "Salvar",
  onSaved,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(
    () => initial?.avatar ?? presetAvatar("fun-emoji", randomSeed()),
  );
  const [uploading, setUploading] = useState(false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !uploading;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const profile = { name: trimmed, avatar };
    saveProfile(profile);
    onSaved?.(profile);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <UserAvatar
          name={trimmed || "?"}
          avatar={avatar}
          className="size-20 text-2xl"
        />
        <div className="flex-1 space-y-2">
          <Label htmlFor="profile-name">Seu nome</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="Como o time te conhece"
            autoComplete="nickname"
            autoFocus
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Avatar</Label>
        <AvatarPicker
          value={avatar}
          onChange={setAvatar}
          onUploadingChange={setUploading}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" disabled={!canSave}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
