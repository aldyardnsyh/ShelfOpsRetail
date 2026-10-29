import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "@/lib/utils";

const ILLUSTRATION_DIR = join(process.cwd(), "public", "illustrations");

// Cache hasil baca file di module scope: isi SVG statis per build.
const cache = new Map<string, string>();

function loadSvg(src: string): string {
  const key = src.replace("/illustrations/", "");
  let svg = cache.get(key);
  if (!svg) {
    svg = readFileSync(join(ILLUSTRATION_DIR, key), "utf-8");
    cache.set(key, svg);
  }
  return svg;
}

/**
 * Merender ilustrasi SVG secara inline (bukan <img>) agar CSS animation
 * di dalam file berjalan sebagai bagian dari halaman.
 * svg dipaksa w-full h-auto agar proporsional di semua breakpoint.
 */
export function AnimatedIllustration({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  const svg = loadSvg(src);
  const animated = svg.includes("@keyframes");

  return (
    <div
      className={cn(
        "relative w-full [&_svg]:block [&_svg]:h-auto [&_svg]:w-full",
        className,
      )}
      role="img"
      aria-label={alt}
      data-animated={animated ? "true" : "false"}
    >
      <div
        style={
          priority
            ? undefined
            : { contentVisibility: "auto", containIntrinsicSize: `${width} ${height}` }
        }
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
