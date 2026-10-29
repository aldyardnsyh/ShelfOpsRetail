"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#ffffff",
          color: "#09090b",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24 }}>
          <p style={{ fontSize: 13, color: "#52525b", margin: 0 }}>ShelfOpsRetail</p>
          <h1 style={{ fontSize: 24, margin: "8px 0" }}>
            ShelfOpsRetail tidak dapat dimuat
          </h1>
          <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 20px" }}>
            Terjadi kesalahan pada lapisan aplikasi. Data operasional tidak berubah.
            Muat ulang halaman; jika tetap gagal, kirim Trace ID di bawah ke admin
            workspace.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
              Trace ID: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid #18181b",
                background: "#18181b",
                color: "#fafafa",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Muat ulang
            </button>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                color: "#09090b",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Kembali ke dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
