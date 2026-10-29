import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "ShelfOpsRetail: satu sistem operasi toko. CCTV, computer vision, stok dan harga, tugas, laporan, dan copilot AI.";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

const FONT = "Geist, Inter, system-ui, sans-serif";

const chips = ["Capture", "Understand", "Record", "Act", "Learn"];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#FAFAFA",
          border: "1px solid #E4E4E7",
          padding: 72,
          fontFamily: FONT,
        }}
      >
        {/* Atas: logo mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginRight: 24,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 56,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#18181B",
                  marginTop: i === 0 ? 0 : 8,
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#18181B",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            ShelfOpsRetail
          </div>
        </div>

        {/* Tengah: subjudul */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "#52525B",
            maxWidth: 900,
            lineHeight: 1.45,
          }}
        >
          Satu sistem operasi toko: CCTV, computer vision, stok dan harga, tugas, laporan, dan copilot
          AI.
        </div>

        {/* Bawah: tahap alur + catatan data */}
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                alignItems: "center",
                height: 48,
                padding: "0 24px",
                marginRight: 12,
                borderRadius: 999,
                backgroundColor: "#FFFFFF",
                border: "1px solid #E4E4E7",
                color: "#18181B",
                fontSize: 20,
              }}
            >
              {chip}
            </div>
          ))}
          <div
            style={{
              flexGrow: 1,
              flexShrink: 1,
              textAlign: "right",
              fontSize: 18,
              color: "#A1A1AA",
            }}
          >
            Demo publik memakai data fiktif
          </div>
        </div>
      </div>
    ),
    size,
  );
}