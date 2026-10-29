#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../deploy/lib.sh
. "$SCRIPT_DIR/../../deploy/lib.sh"

init_paths
load_env
require_docker

if compose ps --status running --services 2>/dev/null | grep -qx gateway; then
  log "membersihkan upload kedaluwarsa lewat gateway"
  compose exec -T gateway /usr/local/bin/shelfops gc objects || warn "gc objects gagal"
fi

log "menghapus image dangling dan build cache > 7 hari"
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null

log "gc selesai"
