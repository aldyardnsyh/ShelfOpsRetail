#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

init_paths
load_env
require_docker

CURRENT_FILE="$STATE_DIR/current_tag"
PREVIOUS_FILE="$STATE_DIR/previous_tag"
HISTORY_FILE="$STATE_DIR/history.log"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  TARGET="$(read_tag "$PREVIOUS_FILE")"
fi

if [[ -z "$TARGET" ]]; then
  die "tidak ada tag sebelumnya. Pakai: rollback.sh <tag>"
fi
[[ "$TARGET" =~ ^[A-Za-z0-9_.-]+$ ]] || die "tag tidak valid: $TARGET"

CURRENT="$(read_tag "$CURRENT_FILE")"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

export IMAGE_TAG="$TARGET"
export IMAGE_PREFIX="${IMAGE_PREFIX:-shelfops}"

log "rollback dari ${CURRENT:-<tidak diketahui>} ke $TARGET"

if [[ "${IMAGE_SOURCE:-build}" == "pull" ]]; then
  compose pull gateway ai-rag ai-vision || die "pull image $TARGET gagal"
fi

compose up -d --remove-orphans --no-build || die "compose up gagal"

if ! wait_for_gateway "$HEALTH_TIMEOUT"; then
  dump_failure_logs
  die "gateway tidak sehat setelah rollback ke $TARGET"
fi

write_tag "$CURRENT_FILE" "$TARGET"
if [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" ]]; then
  write_tag "$PREVIOUS_FILE" "$CURRENT"
fi
printf '%s rollback manual -> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TARGET" >> "$HISTORY_FILE"

log "rollback selesai: $TARGET"
