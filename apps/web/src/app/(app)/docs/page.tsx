import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Dokumentasi & ADR",
};

const STATUS_VARIANT = {
  live: "success",
  partial: "warning",
  planned: "outline",
} as const;

// Modul produk beserta status jujur saat ini (sumber: docs/PRD.md Lampiran A).
const MODULES = [
  { id: "PLAT", name: "Platform & workspace", body: "Login, peran, audit log, batas kuota, mode demo.", status: "live" },
  { id: "DASH", name: "Ringkasan", body: "Satu layar untuk menjalankan toko hari ini.", status: "live" },
  { id: "VIS", name: "Pengunjung", body: "ID stabil, jalur zona, durasi kunjungan per toko.", status: "live" },
  { id: "CAM", name: "Kamera & zona", body: "Feed, monitor wall, dan kesehatan kamera.", status: "live" },
  { id: "SHELF", name: "Rak & barang", body: "Deteksi facing, bbox, skor, bukti foto. Unggah foto membuat sesi audit nyata.", status: "live" },
  { id: "INV", name: "Inventori", body: "Produk, stok per lokasi, dan mutasi masuk-keluar. Baca.", status: "live" },
  { id: "PRICE", name: "Harga", body: "Harga referensi dan deteksi harga tidak cocok. Baca.", status: "live" },
  { id: "PROC", name: "Pengadaan", body: "Supplier, purchase order, dan penerimaan barang. Baca.", status: "live" },
  { id: "ALT", name: "Peringatan & tugas", body: "Antrean tindak lanjut dengan pemilik dan tenggat.", status: "live" },
  { id: "AI", name: "Copilot & pengetahuan", body: "Tanya jawab bersitasi dengan akses baca data toko.", status: "live" },
  { id: "REP", name: "Laporan", body: "Laporan harian/mingguan, tren, dan jadwal kirim. Baca.", status: "live" },
  { id: "LAB", name: "Lab AI", body: "Eval dataset, perbandingan run, trace, dan benchmark.", status: "live" },
] as const;

// Daftar ADR yang benar-benar ada di repo (docs/adr). Halaman ini merangkum
// keputusan yang sudah tercatat; isi lengkapnya ada di repositori.
const ADR_GROUPS = [
  {
    key: "system",
    items: [
      { id: "ADR-001", title: "Bahasa Go untuk gateway, Python untuk layanan AI", status: "accepted" },
      { id: "ADR-009", title: "Topologi hosting hemat: Vercel + satu VPS", status: "accepted" },
      { id: "ADR-010", title: "Mode degradasi bertingkat L0 sampai L3", status: "accepted" },
      {
        id: "ADR-011",
        title: "ShelfOpsRetail sebagai Retail Operations OS: scope v1",
        status: "accepted",
      },
    ],
  },
  {
    key: "ai",
    items: [
      { id: "ADR-004", title: "Hybrid retrieval dengan Reciprocal Rank Fusion", status: "accepted" },
      { id: "ADR-006", title: "Strategi LLM free tier dan provider replay", status: "accepted" },
      { id: "ADR-008", title: "Eval gate sebelum rilis pipeline RAG", status: "accepted" },
    ],
  },
  {
    key: "cv",
    items: [
      { id: "ADR-005", title: "Deteksi hybrid: edge untuk awal, cloud untuk reproses", status: "accepted" },
      { id: "ADR-007", title: "Kuantisasi detektor dan target latensi edge", status: "accepted" },
    ],
  },
  {
    key: "data",
    items: [
      { id: "ADR-002", title: "PostgreSQL dengan pgvector sebagai vector store", status: "accepted" },
      { id: "ADR-003", title: "Antrean berbasis Postgres dengan River", status: "accepted" },
      {
        id: "ADR-012",
        title: "Stock ledger append-only dan pemisahan stok fisik vs sistem",
        status: "accepted",
      },
    ],
  },
] as const;

export default async function DocsPage() {
  const { t } = await getI18n();

  return (
    <div className="space-y-6">
      <PageHeader title={t.docs.title} description={t.docs.subtitle} />

      <section aria-labelledby="docs-modules" className="max-w-3xl">
        <h2
          id="docs-modules"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t.docs.modulesTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t.docs.modulesBody}
        </p>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
          {MODULES.map((module) => (
            <li
              key={module.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{module.name}</p>
                <p className="text-xs text-muted-foreground">{module.body}</p>
              </div>
              <Badge variant={STATUS_VARIANT[module.status]} className="shrink-0">
                {t.docs.statuses2[module.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <div className="max-w-3xl space-y-8">
        {ADR_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`adr-group-${group.key}`}>
            <h2
              id={`adr-group-${group.key}`}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t.docs.groups[group.key]}
            </h2>
            <ul className="mt-3 space-y-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                          {item.id}
                        </p>
                        <Badge variant="success" className="shrink-0">
                          {t.docs.statuses[item.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
