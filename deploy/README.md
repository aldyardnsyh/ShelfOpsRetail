# Deploy ShelfOps ke VPS

Target: **Ubuntu 24.04 LTS, 2 vCPU / 2 GB RAM / 40 GB disk**, satu VPS.
Web (Next.js) tetap di Vercel Hobby; VPS hanya menjalankan Caddy, gateway Go,
ai-rag, ai-vision, dan Postgres 16 + pgvector. Tidak ada Redis, MinIO, atau
Prometheus.

Semua perintah di bawah dijalankan di VPS sebagai user `deploy` (kecuali
bootstrap yang butuh root).

## 1. Prasyarat

1. VPS Ubuntu 24.04 dengan akses SSH key.
2. DNS: A record `api.<domain>` → IP publik VPS. Web Vercel memakai domain
   terpisah (contoh `shelfops.<domain>`).
3. Port 22, 80, 443 terbuka di firewall penyedia.
4. Model ONNX ai-vision sudah tersedia di volume `shelfops_models`
   (lihat bagian 8).

## 2. Bootstrap otomatis

Dari checkout repo di VPS:

```bash
sudo bash deploy/bootstrap-vps.sh \
  --domain example.com \
  --web-url https://shelfops.example.com \
  --email admin@example.com
```

Script ini idempotent dan melakukan:

- install paket dasar + Docker Engine resmi + plugin compose;
- user non-root `deploy` (ditambahkan ke grup `docker`, SSH key root disalin
  bila ada);
- swap 2 GB + `vm.swappiness=10`;
- UFW: deny incoming, allow 22/80/443;
- fail2ban untuk sshd (bisa dimatikan dengan `--no-fail2ban`);
- unattended-upgrades;
- rotasi log Docker 10 MB × 3 + `live-restore`;
- clone repo ke `/opt/shelfops`;
- membuat `.env` produksi dari `deploy/env.production.example` dengan
  `JWT_SECRET`, `SESSION_SECRET`, dan `POSTGRES_PASSWORD` acak (chmod 600).

Setelah selesai, login sebagai `deploy` (grup docker baru aktif), lalu edit
`.env` bila memakai provider LLM/embedding asli. Bootstrap juga membuat symlink
`infra/.env -> ../.env` agar perintah runbook seperti
`docker compose -f docker-compose.prod.yml ps` (dijalankan dari `infra/`)
membaca konfigurasi yang sama. `deploy.sh` sendiri selalu memakai
`--env-file .env` di root repo.

## 3. Bootstrap manual (ringkas)

Jika tidak memakai script:

```bash
# 1. Paket & Docker (repo resmi)
sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg openssl ufw fail2ban unattended-upgrades
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# 2. User deploy
sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy

# 3. Swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 4. Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 5. Repo + env
sudo install -d -o deploy -g deploy /opt/shelfops
sudo -u deploy git clone https://github.com/aldyardnsyh/ShelfOpsRetail.git /opt/shelfops
cd /opt/shelfops
cp deploy/env.production.example .env
chmod 600 .env
# isi placeholder di .env, lalu:
sudo -u deploy bash deploy/deploy.sh
```

Disarankan tetap memakai bootstrap agar konfigurasi daemon Docker dan
fail2ban konsisten.

## 4. Variabel `.env` yang wajib diisi

| Variabel | Contoh / catatan |
| --- | --- |
| `SHELFOPS_HOST` | `shelfops.example.com` (satu host: web + `/api/*`) |
| `ACME_EMAIL` | email akun Let's Encrypt |
| `APP_BASE_URL` | `https://api.example.com` |
| `WEB_BASE_URL` | `https://shelfops.example.com` (Vercel) |
| `COOKIE_DOMAIN` | `.example.com` |
| `POSTGRES_USER` / `POSTGRES_DB` | default `shelfops` |
| `POSTGRES_PASSWORD` | dibuat acak oleh bootstrap |
| `DATABASE_URL` | dibuat bootstrap, host `postgres`, port `5432` |
| `JWT_SECRET` | ≥ 32 karakter, dibuat bootstrap |
| `SESSION_SECRET` | ≥ 32 karakter, dibuat bootstrap |
| `LLM_*` | kosongkan bila `LLM_PROVIDER=replay` |
| `EMBEDDING_*` | kosongkan bila `EMBEDDING_PROVIDER=hash` |
| `VLM_*` | opsional; `VLM_PROVIDER=off` bila tidak dipakai |
| `IMAGE_PREFIX` | `shelfops` untuk build lokal, atau prefix registry |
| `IMAGE_TAG` | diisi otomatis oleh `deploy.sh` |

`COOKIE_SECURE=true` wajib di produksi. Gateway menolak start jika
`JWT_SECRET`/`SESSION_SECRET` kurang dari 32 karakter atau cookie tidak secure.

## 5. GitHub Secrets & Variables

Secrets (Settings → Secrets and variables → Actions):

| Nama | Isi |
| --- | --- |
| `VPS_HOST` | IP atau hostname VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | private key SSH untuk user deploy |
| `VPS_PORT` | opsional, default 22 |
| `GHCR_USERNAME` | opsional, untuk `IMAGE_SOURCE=pull` |
| `GHCR_TOKEN` | opsional, PAT `read:packages` |

Variables:

| Nama | Isi |
| --- | --- |
| `SHELFOPS_DIR` | `/opt/shelfops` |
| `IMAGE_PREFIX` | `shelfops` (build di VPS) atau `ghcr.io/<owner>/shelfops` |

Workflow `.github/workflows/deploy.yml` hanya berjalan lewat
`workflow_dispatch`, tidak otomatis saat push.

## 6. Deploy

```bash
cd /opt/shelfops
bash deploy/deploy.sh
```

Alur `deploy.sh`:

1. build image (`IMAGE_SOURCE=build`) atau pull image (`IMAGE_SOURCE=pull`);
2. hidupkan Postgres dan tunggu `pg_isready`;
3. `shelfops migrate up` (advisory lock, aman dari migrasi paralel);
4. `docker compose up -d` untuk seluruh stack;
5. tunggu `/readyz` gateway sehat (default 120 detik);
6. opsional cek `PUBLIC_HEALTH_URL`;
7. simpan tag sukses ke `.deploy/current_tag` dan tag sebelumnya ke
   `.deploy/previous_tag`;
8. bila healthcheck gagal, otomatis kembali ke tag sebelumnya.

Contoh memilih tag/sumber:

```bash
IMAGE_TAG=2026.10.20 IMAGE_SOURCE=build bash deploy/deploy.sh
IMAGE_PREFIX=ghcr.io/aldyardnsyh/shelfops IMAGE_TAG=abc1234 \
  IMAGE_SOURCE=pull bash deploy/deploy.sh
```

Untuk `IMAGE_SOURCE=pull`, login registry sekali di VPS
(`docker login ghcr.io`) atau biarkan workflow memakai `GHCR_USERNAME` +
`GHCR_TOKEN`. Build di VPS 2 GB bisa lambat; `deploy.sh` membatasi build
paralel ke satu service (`COMPOSE_PARALLEL_LIMIT=1`).

Cek publik (opsional, disarankan setelah DNS stabil):

```bash
PUBLIC_HEALTH_URL=https://api.example.com/healthz bash deploy/deploy.sh
```

Migrasi database **tidak** di-rollback otomatis. Semua migrasi harus
backward-compatible; rollback image dianggap aman untuk skema lama.

## 7. Rollback

```bash
bash deploy/rollback.sh              # tag sebelumnya dari .deploy/previous_tag
bash deploy/rollback.sh <tag>        # eksplisit
```

Rollback hanya mengganti image dan menunggu `/readyz`; data tidak disentuh.
Riwayat ada di `.deploy/history.log`.

## 8. Backup & restore

```bash
bash deploy/backup.sh
```

Menghasilkan di `backups/`:

- `db_<UTC>.sql.gz` — `pg_dump` plain SQL (`--clean --if-exists`);
- `uploads_<UTC>.tar.gz` — isi volume `/data/uploads`;
- `SHA256SUMS_<UTC>`.

Retensi default 7 hari (`RETENTION_DAYS`). Backup dibungkus `flock` agar tidak
tumpang tindih.

Restore:

```bash
bash deploy/restore.sh --yes backups/db_20261020T020000Z.sql.gz
bash deploy/restore.sh --uploads --yes backups/uploads_20261020T020000Z.tar.gz
```

Restore database menghentikan gateway/ai-rag/ai-vision, memutus koneksi aktif,
memulihkan dump, lalu menyalakan kembali service dan menunggu healthcheck.

Cron harian (jam 02:17 UTC):

```cron
17 2 * * * cd /opt/shelfops && bash deploy/backup.sh >> /var/log/shelfops-backup.log 2>&1
```

Uji restore minimal sekali sebelum rilis (RPO 24 jam, RTO 2 jam).

Model vision disimpan di volume `shelfops_models` dan di-mount read-only ke
`/models`. Isi volume sebelum deploy pertama:

```bash
docker volume create shelfops_models
docker run --rm -v shelfops_models:/models -v "$PWD/models:/src:ro" \
  alpine sh -c 'cp -a /src/. /models/'
```

## 9. Verifikasi

```bash
docker compose -f infra/docker-compose.prod.yml ps
curl -fsS https://api.example.com/healthz
curl -fsS https://api.example.com/readyz
docker stats --no-stream
free -m
```

Log:

```bash
docker compose -f infra/docker-compose.prod.yml logs -f --tail=100 gateway
docker compose -f infra/docker-compose.prod.yml logs -f --tail=100 caddy
```

## 10. Batas resource (VPS 2 GB)

| Service | Limit RAM | Limit CPU |
| --- | --- | --- |
| caddy | 96 MB | 0.50 |
| gateway | 224 MB | 1.00 |
| ai-rag | 320 MB | 0.75 |
| ai-vision | 448 MB | 1.00 |
| postgres | 384 MB | 1.00 |

Total limit ≈ 1,47 GB, menyisakan ruang untuk OS/page cache. Bila OOM:
turunkan `VISION_BATCH_SIZE`, pastikan `VISION_CONCURRENCY=1`, dan cek
`docker stats --no-stream`.

## 11. Catatan integrasi ai-rag / ai-vision

Compose mengikuti kontrak service yang ada di repo:

- entrypoint `python -m app.main` (gRPC + HTTP dalam satu proses);
- ai-rag: gRPC `50051`, HTTP `8081`, env prefix `RAG_`;
  `RAG_DATABASE_URL`, `RAG_OBJECT_STORE_ROOT=/data/uploads`,
  `RAG_EMBEDDING_DIM=256` (hash embedder) dan `RAG_VECTOR_DIM=1024`
  (kolom pgvector);
- ai-vision: gRPC `50052`, HTTP `8082`, env prefix `VISION_`;
  `VISION_OBJECT_STORE_ROOT=/data/uploads`, default `VISION_DETECTOR=replay`
  sampai bobot ONNX tersedia;
- kedua container mendapat volume uploads read-only agar bisa membaca berkas
  yang diunggah gateway.

Healthcheck memakai HTTP `/readyz` (rag, termasuk cek DB) dan `/healthz`
(vision), sehingga container hanya sehat bila kedua transport benar-benar
melayani. Bila provider `openai_compatible` belum diimplementasikan di ai-rag,
biarkan `LLM_PROVIDER=replay` dan `EMBEDDING_PROVIDER=hash`.
