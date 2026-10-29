# ShelfOps - Retail Operations OS

Satu sistem operasi toko: CCTV dan foto rak diubah menjadi angka yang bisa
ditindaklanjuti. Pengunjung dengan ID stabil, durasi per zona, rak kosong, harga
tidak sesuai, stok dan mutasi, pengadaan, tugas, laporan, dan Copilot yang
menjawab dari SOP serta data toko dengan sitasi.

Data demo 100% fiktif. Berjalan di VPS 2 vCPU / 2 GB tanpa GPU, tanpa Redis,
tanpa MinIO.

## Tangkapan layar

| Landing | Ringkasan | Rak & bbox |
| --- | --- | --- |
| ![Landing](screenshots/01-landing.jpg) | ![Ringkasan](screenshots/03-dashboard.jpg) | ![Bbox](screenshots/07-shelf-detail.jpg) |

| Kamera | Pelacakan | Laporan |
| --- | --- | --- |
| ![Kamera](screenshots/27-cameras.jpg) | ![Pelacakan](screenshots/15-tracking.jpg) | ![Laporan](screenshots/16-reports.jpg) |

Semua halaman tersedia di folder [`screenshots/`](screenshots):

| Halaman | Berkas |
| --- | --- |
| Landing | [01-landing.jpg](screenshots/01-landing.jpg) |
| Login | [02-login.jpg](screenshots/02-login.jpg) |
| Ringkasan | [03-dashboard.jpg](screenshots/03-dashboard.jpg) |
| Toko | [04-stores.jpg](screenshots/04-stores.jpg) |
| Detail toko | [05-store-detail.jpg](screenshots/05-store-detail.jpg) |
| Sesi rak | [06-shelf.jpg](screenshots/06-shelf.jpg) |
| Detail rak dan bbox | [07-shelf-detail.jpg](screenshots/07-shelf-detail.jpg) |
| Mulai pemantauan | [08-shelf-new.jpg](screenshots/08-shelf-new.jpg) |
| Knowledge base | [09-knowledge.jpg](screenshots/09-knowledge.jpg) |
| Detail dokumen | [10-knowledge-detail.jpg](screenshots/10-knowledge-detail.jpg) |
| Harga | [11-pricing.jpg](screenshots/11-pricing.jpg) |
| Pengadaan | [12-purchasing.jpg](screenshots/12-purchasing.jpg) |
| Inventori | [13-inventory.jpg](screenshots/13-inventory.jpg) |
| Tugas | [14-tasks.jpg](screenshots/14-tasks.jpg) |
| Pelacakan | [15-tracking.jpg](screenshots/15-tracking.jpg) |
| Laporan | [16-reports.jpg](screenshots/16-reports.jpg) |
| Integrasi | [17-integrations.jpg](screenshots/17-integrations.jpg) |
| Lab evaluasi | [18-evals.jpg](screenshots/18-evals.jpg) |
| Benchmark | [19-benchmark.jpg](screenshots/19-benchmark.jpg) |
| Perbandingan | [20-compare.jpg](screenshots/20-compare.jpg) |
| Trace | [21-traces.jpg](screenshots/21-traces.jpg) |
| Detail trace | [22-trace-detail.jpg](screenshots/22-trace-detail.jpg) |
| Pengguna | [23-users.jpg](screenshots/23-users.jpg) |
| Pengaturan | [24-settings.jpg](screenshots/24-settings.jpg) |
| Log audit | [25-audit.jpg](screenshots/25-audit.jpg) |
| Pengunjung | [26-visitors.jpg](screenshots/26-visitors.jpg) |
| Kamera | [27-cameras.jpg](screenshots/27-cameras.jpg) |
| Monitor penuh | [28-cameras-monitor.jpg](screenshots/28-cameras-monitor.jpg) |
| Copilot | [29-copilot.jpg](screenshots/29-copilot.jpg) |
| Dokumentasi modul | [30-docs.jpg](screenshots/30-docs.jpg) |

## Lima lapisan ekosistem

| Lapisan | Isi |
| --- | --- |
| Capture | CCTV/RTSP, unggah foto, impor POS/ERP |
| Understand | Track pengunjung, okupansi zona, facing rak, OCR harga |
| Record | Produk, stok, mutasi, price book, PO/GRN |
| Act | Peringatan, tugas dengan SLA, laporan, Copilot |
| Learn | Eval, trace, benchmark, model registry |

## Stack

| Lapisan | Pilihan |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS, Radix UI, Recharts |
| Gateway dan worker | Go (chi, pgx), satu binary dengan mode api/worker/all, queue Postgres |
| AI | Python, FastAPI dan gRPC, ONNX Runtime untuk vision, RAG hybrid pgvector + tsvector |
| Data | PostgreSQL 16 + pgvector |
| Kontrak | OpenAPI 3.1 untuk REST, protobuf untuk gRPC |
| Deploy | Docker Compose + Caddy di VPS |

## Struktur

```
apps/web            Next.js (semua halaman)
packages/api-client klien OpenAPI yang digenerate
services/gateway    REST API, worker, migrasi, seed
services/ai-rag     layanan RAG (gRPC + HTTP)
services/ai-vision  layanan computer vision (gRPC + HTTP)
infra               compose dev/prod, Caddy, skrip operasional
api, proto          kontrak REST dan gRPC
screenshots         tangkapan layar demo
```

## Quickstart

Mode demo statis, tanpa backend:

```bash
npm install
npm run build --workspace apps/web
NEXT_PUBLIC_DEMO_MODE=1 npm run start --workspace apps/web
# buka http://localhost:3000/login lalu klik "Coba demo"
```

Mode backend lokal:

```bash
# 1) database
docker compose -f infra/docker-compose.dev.yml up -d postgres

# 2) migrasi + gateway
cd services/gateway
DATABASE_URL="postgres://shelfops:shelfops_dev_password@localhost:55433/shelfops?sslmode=disable" \
  go run ./cmd/shelfops migrate up
DATABASE_URL="..." go run ./cmd/shelfops serve

# 3) web
npm run dev --workspace apps/web
# web http://localhost:3000 - api http://localhost:8080/healthz
```

Perintah penting: `make verify`, `make migrate`, `make seed`, `make contracts`,
`make eval`, `make bench`.

### Deploy produksi di VPS

Satu domain, satu origin. Caddy menyajikan web dan mem-proxy `/api/*` ke
gateway, jadi cookie sesi bekerja tanpa CORS.

```bash
cp .env.example .env   # isi domain, secret, admin
make images            # gateway, web, ai-rag, ai-vision
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
```

Admin pertama dibuat otomatis bila `ADMIN_EMAIL` dan `ADMIN_PASSWORD` diisi,
atau manual dengan `make bootstrap-prod`.

`GET /api/v1/readyz` menampilkan provider yang aktif dan daftar mode tiruan
(`mocks`), supaya tidak ada klaim AI nyata tanpa bukti.

## Modul dan status

| Modul | Isi | Status |
| --- | --- | --- |
| Rak dan barang | Deteksi facing, bbox, skor ketersediaan, bukti foto | Live, detektor demo replay |
| Inventori | Produk, stok per lokasi, mutasi masuk-keluar | Live baca |
| Harga | Harga referensi dan deteksi harga tidak cocok | Live baca |
| Pengadaan | Supplier, purchase order, penerimaan barang | Live baca |
| Peringatan dan tugas | Antrean tindak lanjut dengan pemilik dan tenggat | Live, status tugas persisten |
| Copilot dan pengetahuan | Tanya jawab bersitasi dengan akses data toko | Live, provider default replay |
| Laporan | Laporan harian, mingguan, bulanan, jadwal kirim | Live baca |
| Lab AI | Dataset eval, perbandingan run, trace, benchmark | Live baca |

## Mode demo

Dua profil dari satu commit:

- Production: `NEXT_PUBLIC_DEMO_MODE` kosong dan `NEXT_PUBLIC_API_URL` wajib.
  Halaman membaca gateway, login dan RBAC aktif.
- Demo backend: tombol "Coba demo" membuat sesi pada workspace demo berisi seed.
- Demo statis: `NEXT_PUBLIC_DEMO_MODE=1` membaca `apps/web/fixtures/*.json`
  tanpa database dan tanpa secret.

Fixture demo adalah salinan respons gateway, bukan data karangan. Setelah
kontrak API berubah:

```bash
npm run sync:demo-fixtures   # regenerasi fixture dari gateway lokal
npm test                     # validasi bentuk dan relasi antar fixture
```

## Lisensi

Hak cipta 2026 PogungSoftwareHouseTeam (PSHT). Seluruh hak dilindungi.
Lihat [LICENSE.md](LICENSE.md).