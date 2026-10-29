"use client";

import { CameraFrame, type FeedCamera, type FeedLabels } from "@/components/camera-frame";
import monitorFixture from "../../../fixtures/monitor.json";

// Dua kamera dari fixture demo (sudah online): satu besar, satu pendamping.
// Frame asli dari komponen CameraFrame: OSD timestamp berdetik, LIVE dot,
// dan bbox deteksi bergerak via use-live-mock. Bukan ilustrasi statis.
export function MockCamera({ labels }: { labels: FeedLabels }) {
  const cameras = (monitorFixture.cameras as FeedCamera[])
    .filter((camera) => camera.status === "online")
    .slice(0, 2);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-background p-3 sm:p-4">
      <div className="grid gap-3 sm:gap-4">
        {cameras.map((camera) => (
          <CameraFrame
            key={camera.id}
            camera={camera}
            labels={labels}
            className="rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}
