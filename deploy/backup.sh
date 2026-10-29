#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

init_paths
load_env
require_docker
require_env POSTGRES_USER POSTGRES_DB

RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

CURRENT_TAG="$(read_tag "$STATE_DIR/current_tag")"
if [[ -n "$CURRENT_TAG" ]]; then
  export IMAGE_TAG="$CURRENT_TAG"
fi
export IMAGE_PREFIX="${IMAGE_PREFIX:-shelfops}"
DB_FILE="$BACKUP_DIR/db_${STAMP}.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads_${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.backup.lock"
  flock -n 9 || die "backup lain sedang berjalan"
fi

compose ps --status running --services | grep -qx postgres \
  || die "container postgres tidak berjalan"

log "backup database ke $DB_FILE"
if ! compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists | gzip -9 > "$DB_FILE.tmp"; then
  rm -f "$DB_FILE.tmp"
  die "pg_dump gagal"
fi
mv "$DB_FILE.tmp" "$DB_FILE"

log "backup uploads ke $UPLOADS_FILE"
if ! compose run --rm --no-deps -T --entrypoint tar gateway \
  -C /data -czf - uploads > "$UPLOADS_FILE.tmp"; then
  rm -f "$UPLOADS_FILE.tmp"
  die "arsip uploads gagal"
fi
mv "$UPLOADS_FILE.tmp" "$UPLOADS_FILE"

(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$DB_FILE")" "$(basename "$UPLOADS_FILE")" > "SHA256SUMS_${STAMP}"
)

log "menghapus backup lebih lama dari $RETENTION_DAYS hari"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db_*.sql.gz' -o -name 'uploads_*.tar.gz' -o -name 'SHA256SUMS_*' \) \
  -mtime "+$RETENTION_DAYS" -delete

du -sh "$DB_FILE" "$UPLOADS_FILE" | sed 's/^/  /'
log "backup selesai"
