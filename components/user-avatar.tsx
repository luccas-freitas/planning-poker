"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarSrc, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  avatar: string | null | undefined;
  className?: string;
};

/** Avatar do usuário: preset DiceBear, foto enviada ou iniciais. */
export function UserAvatar({ name, avatar, className }: Props) {
  return (
    <Avatar className={cn("bg-muted", className)}>
      <AvatarImage src={avatarSrc(avatar)} alt={name} />
      <AvatarFallback className="font-semibold">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
