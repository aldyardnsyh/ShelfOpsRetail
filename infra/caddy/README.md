# Caddy — reverse proxy produksi

Caddy adalah satu-satunya proses yang mengekspos port ke internet.

| Port host | Tujuan | Keterangan |
| --- | --- | --- |
| `80/tcp` | Caddy | redirect HTTP → HTTPS + ACME HTTP challenge |
| `443/tcp` | Caddy | HTTPS (HTTP/1.1, HTTP/2) |
| `443/udp` | Caddy | HTTP/3 (QUIC) |

Tidak ada port lain yang dipublikasikan. Postgres, gateway, ai-rag, dan ai-vision
hanya bisa dijangkau lewat jaringan Docker `shelfops_backend`.

## Routing

| Host | Upstream | Publik? |
| --- | --- | --- |
| `api.<SHELFOPS_DOMAIN>` | `gateway:8080` | ya |
| `rag.internal` | `ai-rag:50051` (gRPC) / `:8081` (HTTP) | **tidak** |
| `vision.internal` | `ai-vision:50052` (gRPC) / `:8082` (HTTP) | **tidak** |

Gateway memanggil service AI langsung memakai DNS Docker
(`RAG_GRPC_ADDR=ai-rag:50051`, `VISION_GRPC_ADDR=ai-vision:50052`). Tidak ada
site block untuk `rag.internal`/`vision.internal`; hostname itu hanya nama
internal dan tidak pernah dibuatkan sertifikat publik.

## Environment

Caddy membaca dua variabel dari `docker-compose.prod.yml`:

- `SHELFOPS_DOMAIN` — domain tanpa `api.` (contoh: `aldyardnsyh.my.id`).
  Caddy melayani `api.aldyardnsyh.my.id`.
- `ACME_EMAIL` — email akun ACME untuk notifikasi masa berlaku sertifikat.

Nilai tersebut berasal dari `.env` VPS (dibuat oleh `deploy/bootstrap-vps.sh`).

## Perilaku keamanan dan performa

- HSTS 1 tahun + `includeSubDomains`. Jangan aktifkan `preload` sebelum yakin
  seluruh subdomain memakai HTTPS.
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `COOP`, `CORP`, dan CSP ketat untuk respons API.
- Header `Server` dihapus.
- `encode zstd gzip` untuk respons teks/JSON.
- `request_body max_size 25MB` membatasi upload (dokumen maksimum 20 MB).
- `flush_interval -1` pada `reverse_proxy` agar Server-Sent Events (progress
  ingestion dan chat) tidak tertahan buffer.
- Admin API Caddy hanya mendengarkan `127.0.0.1:2019` di dalam container
  (dipakai healthcheck), tidak pernah dipublikasikan.
- Log akses JSON ke stdout, dibatasi Docker `json-file` 10 MB × 3.

## DNS

Sebelum deploy pertama:

1. Buat A record `api.<SHELFOPS_DOMAIN>` → IP publik VPS.
2. Pastikan port 80 dan 443 terbuka di UFW dan firewall penyedia VPS.
3. Tunggu propagasi DNS (`dig +short api.<domain>`).
4. Jalankan deploy. Caddy akan meminta sertifikat saat request pertama; proses
   ini bisa memakan 10–60 detik.

Bila memakai proxy Cloudflare, mode SSL harus **Full (strict)**. Jangan memakai
mode Flexible karena akan membuat loop redirect.

## Validasi konfigurasi

```bash
docker run --rm \
  -e SHELFOPS_DOMAIN=example.com \
  -e ACME_EMAIL=admin@example.com \
  -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10-alpine caddy validate --config /etc/caddy/Caddyfile
```

Atau lewat container yang sedang berjalan:

```bash
docker compose -f infra/docker-compose.prod.yml exec caddy \
  caddy validate --config /etc/caddy/Caddyfile
```

## Troubleshooting

- **Sertifikat gagal terbit** — cek A record, port 80/443, dan log
  `docker compose logs caddy`. Rate limit Let's Encrypt bisa tercapai bila
  deploy diulang terlalu sering; tunggu satu jam.
- **502 Bad Gateway** — gateway belum sehat. Cek
  `docker compose exec gateway wget -qO- http://127.0.0.1:8080/readyz`.
- **SSE terasa putus** — pastikan `flush_interval -1` tidak dihapus dan tidak ada
  proxy lain (Cloudflare) yang melakukan buffering.
- **Upload 413** — naikkan `max_size` di Caddyfile dan `UPLOAD_MAX_DOC_MB`
  secara bersamaan.
