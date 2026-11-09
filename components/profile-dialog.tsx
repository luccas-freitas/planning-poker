"use client";

import { useState } from "react";
import { ProfileForm } from "@/components/profile-form";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Profile } from "@/lib/profile";

/** Botão com o avatar do usuário que abre a edição de perfil. */
export function ProfileDialog({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar perfil"
        className="focus-visible:ring-ring/50 rounded-full focus-visible:ring-3 focus-visible:outline-none"
      >
        <UserAvatar
          name={profile.name}
          avatar={profile.avatar}
          className="size-8"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>
              A mudança aparece para todos na sala.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ProfileForm
              initial={profile}
              onSaved={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
