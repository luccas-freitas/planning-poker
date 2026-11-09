import { Suspense } from "react";
import type { Metadata } from "next";
import { RoomSkeleton, RoomView } from "@/components/room/room-view";

export const metadata: Metadata = {
  title: "Sala · Planning Poker",
};

export default function RoomPage({ params }: PageProps<"/r/[slug]">) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      {params.then(({ slug }) => (
        <RoomView slug={slug} />
      ))}
    </Suspense>
  );
}
