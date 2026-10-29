#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

init_paths
load_env
require_docker
require_env POSTGRES_USER POSTGRES_DB

MODE="auto"
ASSUME_YES=0
FILE=""

usage() {
  cat <<'EOF'
Pakai: restore.sh [--db|--uploads] [--yes] <file>

  --db        file pg_dump .sql.gz
  --uploads   arsip uploads .tar.gz
  --yes       tanpa konfirmasi interaktif

Tanpa --db/--uploads, tipe dideteksi dari nama file
(db_*.sql.gz atau uploads_*.tar.gz).
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --db) MODE="db"; shift ;;
    --uploads) MODE="uploads"; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "opsi tidak dikenal: $1" ;;
    *)
      [[ -z "$FILE" ]] || die "hanya satu file yang boleh diberikan"
      FILE="$1"
      shift
      ;;
  esac
done

[[ -n "$FILE" ]] || { usage; exit 1; }
[[ -f "$FILE" ]] || die "file tidak ditemukan: $FILE"

if [[ "$MODE" == "auto" ]]; then
  case "$(basename "$FILE")" in
    db_*.sql.gz|*.sql.gz) MODE="db" ;;
    uploads_*.tar.gz|*.tar.gz) MODE="uploads" ;;
    *) die "tidak bisa mendeteksi tipe backup; pakai --db atau --uploads" ;;
  esac
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  printf 'Restore %s dari %s akan menimpa data. Ketik "restore" untuk lanjut: ' "$MODE" "$FILE"
  read -r answer
  [[ "$answer" == "restore" ]] || die "dibatalkan"
fi

CURRENT_TAG="$(read_tag "$STATE_DIR/current_tag")"
if [[ -n "$CURRENT_TAG" ]]; then
  export IMAGE_TAG="$CURRENT_TAG"
fi
export IMAGE_PREFIX="${IMAGE_PREFIX:-shelfops}"

if [[ "$MODE" == "db" ]]; then
  log "menghentikan service yang memakai database"
  compose stop gateway ai-rag ai-vision >/dev/null 2>&1 || true

  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" \
    >/dev/null

  log "restore database dari $FILE"
  if ! gunzip -c "$FILE" | compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null; then
    warn "restore database gagal; menyalakan kembali service"
    compose up -d gateway ai-rag ai-vision >/dev/null 2>&1 || true
    die "restore database gagal"
  fi

  log "menyalakan kembali service"
  compose up -d gateway ai-rag ai-vision
  wait_for_gateway 120 || {
    dump_failure_logs
    die "gateway tidak sehat setelah restore"
  }
elif [[ "$MODE" == "uploads" ]]; then
  log "restore uploads dari $FILE"
  compose run --rm --no-deps -T --entrypoint sh gateway \
    -c 'rm -rf /data/uploads && mkdir -p /data/uploads && tar -C /data -xzf -' < "$FILE"
  compose up -d gateway
else
  die "mode restore tidak dikenal: $MODE"
fi

log "restore selesai ($MODE)"
