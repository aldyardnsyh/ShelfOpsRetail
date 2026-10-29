import { Camera } from "@/components/icons";
import { cn } from "@/lib/utils";

// Ilustrasi produk: denah toko dengan kamera, jalur pengunjung, dan rak kosong.
// Semua angka pada komponen ini adalah contoh tetap, bukan data live.
interface StoreMonitorMockProps {
  labels: {
    live: string;
    cameras: string;
    zone: string;
    visitorsNow: string;
    averageDwell: string;
    busiestZone: string;
    emptyFacing: string;
    demo: string;
    cameraNames: readonly [string, string, string, string];
    zones: readonly [string, string, string];
  };
  className?: string;
}

const VISITORS = [
  { id: "P-0142", x: 88, y: 108, dwell: "2m 18s", color: "var(--color-bbox-1)" },
  { id: "P-0143", x: 236, y: 58, dwell: "1m 04s", color: "var(--color-bbox-3)" },
  { id: "P-0144", x: 128, y: 174, dwell: "0m 41s", color: "var(--color-bbox-2)" },
];

const TRAILS = [
  "M 42 214 C 60 190 74 140 88 118",
  "M 110 112 C 160 96 204 78 244 64",
  "M 306 52 C 268 104 202 150 162 180",
];

const CAMERAS = [
  { x: 26, y: 34, cone: "18,26 124,26 86,132" },
  { x: 334, y: 34, cone: "342,26 236,26 274,132" },
  { x: 26, y: 216, cone: "18,230 112,230 86,142" },
  { x: 334, y: 216, cone: "342,230 248,230 274,142" },
];

export function StoreMonitorMock({
  labels,
  className,
}: StoreMonitorMockProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success-soft-border bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success-strong">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            {labels.live}
          </span>
          <span className="text-xs font-medium text-foreground">{labels.cameras}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Camera className="size-3.5" aria-hidden="true" />
          <span>CAM 01-04</span>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="rounded-md border border-border bg-surface-subtle">
          <svg
            viewBox="0 0 360 250"
            role="img"
            aria-label={`${labels.cameras}: ${labels.zone}`}
            className="h-auto w-full"
          >
            {/* Ruang toko */}
            <rect
              x="18"
              y="26"
              width="324"
              height="204"
              rx="8"
              fill="var(--color-background)"
              stroke="var(--color-border-strong)"
            />

            {/* Area pandang kamera */}
            {CAMERAS.map((camera) => (
              <polygon
                key={camera.cone}
                points={camera.cone}
                fill="var(--color-accent)"
                fillOpacity="0.1"
                stroke="var(--color-accent)"
                strokeOpacity="0.35"
                strokeDasharray="5 4"
              />
            ))}

            {/* Rak: tiga lorong */}
            {[54, 110, 166].map((y) => (
              <g key={y}>
                <rect x="60" y={y} width="184" height="18" rx="2" fill="var(--color-muted)" stroke="var(--color-border-strong)" />
                <rect x="252" y={y} width="56" height="18" rx="2" fill="var(--color-muted)" stroke="var(--color-border-strong)" />
                {[68, 104, 140, 176, 212].map((x) => (
                  <line key={x} x1={x} y1={y + 2} x2={x} y2={y + 16} stroke="var(--color-border-strong)" strokeWidth="0.6" />
                ))}
              </g>
            ))}

            {/* Satu facing kosong: penanda kecil, bukan elemen dominan */}
            <rect
              x="262"
              y="110"
              width="18"
              height="18"
              fill="var(--color-warning-soft)"
              stroke="var(--color-warning-strong)"
              strokeWidth="1"
              strokeDasharray="3 2"
            />

            {/* Jalur pengunjung */}
            {TRAILS.map((path, index) => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke={VISITORS[index]?.color ?? "var(--color-border)"}
                strokeWidth="1.6"
                strokeDasharray="4 4"
                opacity="0.5"
              />
            ))}

            {/* Pengunjung: siluet dalam kotak tracking + ID dan dwell */}
            {VISITORS.map((visitor) => (
              <g key={visitor.id}>
                <rect
                  x={visitor.x}
                  y={visitor.y}
                  width="26"
                  height="34"
                  rx="3"
                  fill={visitor.color}
                  fillOpacity="0.08"
                  stroke={visitor.color}
                  strokeWidth="1.4"
                />
                <circle cx={visitor.x + 13} cy={visitor.y + 10} r="4" fill={visitor.color} />
                <path
                  d={`M ${visitor.x + 5} ${visitor.y + 30} a 8 8 0 0 1 16 0 z`}
                  fill={visitor.color}
                />
                <g>
                  <rect
                    x={visitor.x + 30}
                    y={visitor.y + 1}
                    width="82"
                    height="27"
                    rx="3"
                    fill="var(--color-background)"
                    stroke={visitor.color}
                  />
                  <text x={visitor.x + 35} y={visitor.y + 11} className="fill-foreground" fontSize="12" fontWeight="600">
                    {visitor.id}
                  </text>
                  <text x={visitor.x + 35} y={visitor.y + 20} className="fill-muted-foreground" fontSize="11.5">
                    {visitor.dwell}
                  </text>
                </g>
              </g>
            ))}

            {/* Kamera dengan housing dan lensa */}
            {CAMERAS.map((camera) => (
              <g key={`${camera.x}-${camera.y}`} transform={`translate(${camera.x} ${camera.y})`}>
                <rect x="-9" y="-5" width="18" height="9" rx="2" fill="var(--color-foreground)" />
                <rect x="-13" y="-2" width="4" height="3" rx="1" fill="var(--color-foreground)" />
                <circle cx="8" cy="0" r="2.6" fill="var(--color-background)" />
              </g>
            ))}

            {/* Nama zona */}
            <g className="fill-muted-foreground" fontSize="12">
              <text x="252" y="212">{labels.zones[0]}</text>
              <text x="60" y="212">{labels.zones[1]}</text>
              <text x="60" y="47">{labels.zones[2]}</text>
            </g>
          </svg>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2">
          {[
            { label: labels.visitorsNow, value: "18" },
            { label: labels.averageDwell, value: "4m 12s" },
            { label: labels.busiestZone, value: labels.zones[0] },
            { label: labels.emptyFacing, value: "3" },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {labels.cameraNames.map((name, index) => (
            <div
              key={name}
              className={cn(
                "overflow-hidden rounded-md border",
                index === 0
                  ? "border-accent-soft-border"
                  : "border-border",
              )}
            >
              <div
                className={cn(
                  "relative h-14",
                  index === 0 ? "bg-accent-soft" : "bg-surface-subtle",
                )}
                aria-hidden="true"
              >
                <div className="absolute inset-x-0 top-3 border-t border-border-strong/60" />
                <div className="absolute left-1.5 top-5 h-4 w-8 rounded-[1px] border border-border-strong bg-background" />
                <div className="absolute left-11 top-5 h-4 w-7 rounded-[1px] border border-border-strong bg-background" />
                {index === 0 ? (
                  <span className="absolute bottom-1.5 left-2 size-1.5 rounded-full bg-bbox-1 ring-2 ring-background" />
                ) : null}
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 size-1 rounded-full",
                    index === 0 ? "bg-accent" : "bg-success",
                  )}
                />
              </div>
              <div className="border-t border-border px-2 py-1">
                <span className="text-[10px] font-medium text-foreground">{name}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">{labels.demo}</p>
      </div>
    </div>
  );
}
