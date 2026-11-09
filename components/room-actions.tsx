"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/profile";
import { parseRoomInput, roomPath } from "@/lib/room";
import { ensureSession, getSupabase } from "@/lib/supabase";

/** Cards de "Criar sala" e "Entrar em uma sala" da home. */
export function RoomActions({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const joinSlug = parseRoomInput(joinInput);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await ensureSession();
      const { data: slug, error } = await getSupabase().rpc("create_room", {
        p_display_name: profile.name,
        p_avatar_url: profile.avatar ?? undefined,
        p_name: roomName.trim() || undefined,
      });
      if (error) throw error;
      router.push(roomPath(slug));
    } catch {
      toast.error("Não foi possível criar a sala. Tente novamente.");
      setCreating(false);
    }
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (joinSlug) router.push(roomPath(joinSlug));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Criar sala</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRoom} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="room-name">Nome (opcional)</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={80}
                placeholder="Ex.: Sprint 42"
              />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              Criar sala
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entrar em uma sala</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={joinRoom} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="room-code">Link ou código</Label>
              <Input
                id="room-code"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Cole o link aqui"
                aria-invalid={joinInput.trim() !== "" && !joinSlug}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={!joinSlug}
            >
              Entrar <ArrowRight />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
