# ShelfOps - Retail Operations OS

Satu sistem operasi toko: CCTV dan foto rak diubah menjadi angka yang bisa
ditindaklanjuti. Pengunjung dengan ID stabil, durasi per zona, rak kosong, harga
tidak sesuai, stok dan mutasi, pengadaan, tugas, laporan, dan Copilot yang
menjawab dari SOP serta data toko dengan sitasi.


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

## Tech stack

**Frontend**

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radixui&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-8884D8?style=for-the-badge)

**Backend dan data**

![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-244C5A?style=for-the-badge&logo=grpc&logoColor=white)
![Protocol Buffers](https://img.shields.io/badge/Protocol_Buffers-4285F4?style=for-the-badge&logo=protobuf&logoColor=white)
![OpenAPI](https://img.shields.io/badge/OpenAPI_3.1-6BA539?style=for-the-badge&logo=openapiinitiative&logoColor=white)

**AI**

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-005CED?style=for-the-badge&logo=onnx&logoColor=white)
![RAG hybrid](https://img.shields.io/badge/RAG_hybrid-pgvector_+_tsvector-7C3AED?style=for-the-badge)

**Infrastruktur**

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-1F8ACB?style=for-the-badge)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)

| Lapisan | Detail |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS, Radix UI, Recharts |
| Gateway dan worker | Go dengan chi dan pgx, satu binary mode api/worker/all, queue PostgreSQL |
| AI | Python, FastAPI, gRPC, ONNX Runtime, RAG hybrid pgvector dan tsvector |
| Data | PostgreSQL 16 dan pgvector |
| Kontrak | OpenAPI 3.1 untuk REST, protobuf untuk gRPC |
| Deploy | Docker Compose dan Caddy di VPS |

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