"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { RoomActions } from "@/components/room-actions";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useProfile } from "@/lib/profile";

export default function Home() {
  const profile = useProfile();
  const [editing, setEditing] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold tracking-tight">🃏 Planning Poker</h1>
        <p className="text-muted-foreground">
          Estimativas em tempo real para o time.
        </p>
      </header>

      {profile === undefined ? (
        <Card className="h-64 animate-pulse" aria-busy="true" />
      ) : !profile || editing ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {profile ? "Editar perfil" : "Como o time vai te ver?"}
            </CardTitle>
            <CardDescription>
              Escolha um nome e um avatar. Fica salvo só neste navegador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initial={profile}
              submitLabel={profile ? "Salvar" : "Continuar"}
              onSaved={() => setEditing(false)}
              onCancel={profile ? () => setEditing(false) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex items-center gap-4">
              <UserAvatar
                name={profile.name}
                avatar={profile.avatar}
                className="size-14 text-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-sm">Olá,</p>
                <p className="truncate text-lg font-semibold">{profile.name}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil /> Editar
              </Button>
            </CardContent>
          </Card>
          <RoomActions profile={profile} />
        </>
      )}
    </main>
  );
}
