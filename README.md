# ShelfOps - Retail Operations OS

Satu sistem operasi toko: CCTV dan foto rak diubah menjadi angka yang bisa
ditindaklanjuti. Pengunjung dengan ID stabil, durasi per zona, rak kosong, harga
tidak sesuai, stok dan mutasi, pengadaan, tugas, laporan, dan Copilot yang
menjawab dari SOP serta data toko dengan sitasi.


## Tangkapan layar

Diambil langsung dari stack produksi yang berjalan (`docker compose`, 1440Ã—900).

| Landing | Login demo |
| --- | --- |
| ![Landing](assets/screenshots/01-landing.png) | ![Login](assets/screenshots/02-login.png) |

| Ringkasan toko | Inventori |
| --- | --- |
| ![Ringkasan](assets/screenshots/03-dashboard.png) | ![Inventori](assets/screenshots/04-inventory.png) |

| Pengadaan (PO & penerimaan) | Pemantauan rak |
| --- | --- |
| ![Pengadaan](assets/screenshots/05-purchasing.png) | ![Pemantauan](assets/screenshots/06-audit.png) |

| Tugas | Copilot dengan sitasi |
| --- | --- |
| ![Tugas](assets/screenshots/07-tasks.png) | ![Copilot](assets/screenshots/08-copilot.png) |

Semua tangkapan tersimpan di [`assets/screenshots/`](assets/screenshots) dan bisa
diregenerasi kapan saja dengan `npx tsx scripts/capture-screenshots.ts`
(butuh stack sedang hidup).

## Fitur utama

| Modul | Isi |
| --- | --- |
| Pemantauan rak | Foto rak/CCTV â†’ deteksi facing, rak kosong, kesesuaian harga, skor kepatuhan |
| Audit foto | Buat sesi â†’ unggah foto â†’ proses â†’ review â†’ **finalisasi** (otomatis membuat alert + task) |
| Pengadaan | **Buat PO** dan **catat penerimaan barang** (menambah stok + jejak mutasi, idempoten) |
| Inventori | Stok per toko/lokasi, reorder point, mutasi masuk/keluar |
| Tugas & alert | Alert OOS/selisih harga berubah menjadi tugas dengan SLA |
| Copilot | Tanya jawab dari SOP dan data toko dengan sitasi dan batas biaya harian |
| Pengunjung & zona | Footfall, okupansi zona, durasi tinggal |
| Lab evaluasi | Eval set, benchmark, perbandingan model, trace |
| Admin | Pengguna, integrasi/konektor, pengaturan workspace, log audit |

## Status kesiapan produksi

| Area | Status |
| --- | --- |
| Stack Docker (Caddy + web + gateway + Postgres + ai-rag + ai-vision) | Berjalan sehat, `healthz`/`readyz` hijau |
| Smoke test end-to-end | Lulus: login, upload dokumen, chat, auditâ†’finalize, PO, GRN (+idempoten), guard IDOR |
| Provider AI nyata | Jalur `openai-compatible`, ONNX, RapidOCR/cloud tersedia lewat env |
| Guard produksi | Gateway **menolak boot** bila provider AI masih tiruan, kecuali `ALLOW_MOCK_PROVIDERS=true` |
| E2E browser | Playwright: landing (desktop+mobile) + alur login demo â†’ halaman operasional |
| Data demo | `NEXT_PUBLIC_DEMO_MODE=1` menjalankan web tanpa backend memakai fixture |

Detail env per provider dan langkah go-live ada di `.env.example` dan
`docs/PRODUCTION.md`.
 |

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
assets/screenshots  tangkapan layar (dari stack berjalan)
scripts             skrip smoke test & capture screenshot
```

## Quickstart

Jalankan seluruh stack (web + API + Postgres + AI) dengan Docker:

```bash
cp .env.example .env        # isi minimal: SHELFOPS_HOST, ACME_EMAIL, secret, ADMIN_*
make images                 # atau: docker compose --env-file .env -f infra/docker-compose.prod.yml build
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
docker compose --env-file .env -f infra/docker-compose.prod.yml ps   # semua harus healthy

# buat admin pertama (sekali)
make bootstrap-prod
```

Buka `https://<SHELFOPS_HOST>/`. Untuk uji lokal tanpa TLS, set
`SHELFOPS_HOST=http://localhost` dan `ALLOW_INSECURE_COOKIE=true`.

Verifikasi cepat: `powershell -File scripts/smoke-prod.ps1 -BaseUrl http://localhost`.

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