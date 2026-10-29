#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Pakai: deploy.sh [opsi]

Opsi:
  --tag TAG          Tag image yang dideploy (default: git SHA pendek)
  --source build|pull Sumber image (default: build)
  --skip-public-check Lewati pengecekan URL publik
  -h, --help         Tampilkan bantuan

Env:
  ENV_FILE, COMPOSE_FILE, IMAGE_TAG, IMAGE_SOURCE, IMAGE_PREFIX
  PUBLIC_HEALTH_URL, HEALTH_TIMEOUT
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

# Nilai dari shell (workflow/CLI) menang atas isi .env.
PREFERRED_IMAGE_TAG="${IMAGE_TAG:-}"
PREFERRED_IMAGE_PREFIX="${IMAGE_PREFIX:-}"
PREFERRED_IMAGE_SOURCE="${IMAGE_SOURCE:-}"

init_paths
load_env

if [[ -n "$PREFERRED_IMAGE_TAG" ]]; then
  IMAGE_TAG="$PREFERRED_IMAGE_TAG"
fi
if [[ -n "$PREFERRED_IMAGE_PREFIX" ]]; then
  IMAGE_PREFIX="$PREFERRED_IMAGE_PREFIX"
fi
if [[ -n "$PREFERRED_IMAGE_SOURCE" ]]; then
  IMAGE_SOURCE="$PREFERRED_IMAGE_SOURCE"
fi

require_docker
require_env SHELFOPS_HOST ACME_EMAIL APP_BASE_URL WEB_BASE_URL DATABASE_URL JWT_SECRET SESSION_SECRET POSTGRES_PASSWORD

IMAGE_TAG="${IMAGE_TAG:-}"
IMAGE_SOURCE="${IMAGE_SOURCE:-build}"
IMAGE_PREFIX="${IMAGE_PREFIX:-shelfops}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
PUBLIC_HEALTHCHECK="${PUBLIC_HEALTHCHECK:-auto}"

while (( $# > 0 )); do
  case "$1" in
    --tag)
      [[ $# -ge 2 ]] || die "--tag butuh nilai"
      IMAGE_TAG="$2"
      shift 2
      ;;
    --source)
      [[ $# -ge 2 ]] || die "--source butuh nilai"
      IMAGE_SOURCE="$2"
      shift 2
      ;;
    --skip-public-check)
      PUBLIC_HEALTHCHECK="never"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "opsi tidak dikenal: $1"
      ;;
  esac
done

if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
fi

[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || die "tag image tidak valid: $IMAGE_TAG"
[[ "$IMAGE_SOURCE" == "build" || "$IMAGE_SOURCE" == "pull" ]] || die "IMAGE_SOURCE harus build atau pull"

export IMAGE_TAG IMAGE_PREFIX
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
CURRENT_FILE="$STATE_DIR/current_tag"
PREVIOUS_FILE="$STATE_DIR/previous_tag"
HISTORY_FILE="$STATE_DIR/history.log"
PREVIOUS_TAG="$(read_tag "$CURRENT_FILE")"

rollback_to() {
  local target="$1" failed="$2"
  if [[ -z "$target" ]]; then
    warn "tidak ada tag rilis sebelumnya untuk rollback"
    return 1
  fi
  if [[ "$target" == "$failed" ]]; then
    warn "tag sebelumnya sama dengan tag yang gagal ($target); rollback dilewati"
    return 1
  fi
  log "rollback ke tag $target"
  export IMAGE_TAG="$target"
  compose up -d --remove-orphans --no-build || return 1
  wait_for_gateway "$HEALTH_TIMEOUT" || return 1
  write_tag "$CURRENT_FILE" "$target"
  write_tag "$PREVIOUS_FILE" "$failed"
  printf '%s rollback %s -> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$failed" "$target" >> "$HISTORY_FILE"
  return 0
}

log "mulai deploy tag=$IMAGE_TAG source=$IMAGE_SOURCE prefix=$IMAGE_PREFIX"

if [[ "$IMAGE_SOURCE" == "build" ]]; then
  log "build image gateway, web, ai-rag, ai-vision"
  compose build --pull gateway web ai-rag ai-vision || die "build image gagal"
else
  log "pull image gateway, web, ai-rag, ai-vision"
  compose pull gateway web ai-rag ai-vision || die "pull image gagal"
fi

log "menyalakan postgres"
compose up -d postgres || die "gagal menyalakan postgres"
wait_for_postgres 120 || {
  dump_failure_logs
  die "postgres tidak sehat"
}

log "menjalankan migrasi database"
if ! compose run --rm --no-deps -T gateway migrate up; then
  dump_failure_logs
  die "migrasi gagal; container versi lama dibiarkan berjalan"
fi

# Admin pertama: opsional tetapi sangat disarankan pada deployment baru.
# Sandi dikirim lewat env container, bukan argumen proses.
if [[ -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
  log "bootstrap admin pertama ($ADMIN_EMAIL)"
  compose run --rm --no-deps -T -e BOOTSTRAP_PASSWORD="$ADMIN_PASSWORD" gateway \
    bootstrap --email "$ADMIN_EMAIL" --workspace "${ADMIN_WORKSPACE:-ShelfOps}" \
    || die "bootstrap admin gagal"
fi

log "menerapkan rilis"
if ! compose up -d --remove-orphans --no-build; then
  dump_failure_logs
  if rollback_to "$PREVIOUS_TAG" "$IMAGE_TAG"; then
    die "compose up gagal; sudah rollback ke $PREVIOUS_TAG"
  fi
  die "compose up gagal dan rollback tidak tersedia"
fi

log "menunggu healthcheck gateway"
if ! wait_for_gateway "$HEALTH_TIMEOUT"; then
  dump_failure_logs
  if rollback_to "$PREVIOUS_TAG" "$IMAGE_TAG"; then
    die "healthcheck gagal; sudah rollback ke $PREVIOUS_TAG"
  fi
  die "healthcheck gagal dan rollback tidak tersedia"
fi

if [[ "$PUBLIC_HEALTHCHECK" == "always" && -z "${PUBLIC_HEALTH_URL:-}" ]]; then
  die "PUBLIC_HEALTHCHECK=always tapi PUBLIC_HEALTH_URL kosong"
fi

if [[ -n "${PUBLIC_HEALTH_URL:-}" && "$PUBLIC_HEALTHCHECK" != "never" ]]; then
  log "menunggu healthcheck publik: $PUBLIC_HEALTH_URL"
  if ! wait_for_url "$PUBLIC_HEALTH_URL" "$HEALTH_TIMEOUT"; then
    dump_failure_logs
    if rollback_to "$PREVIOUS_TAG" "$IMAGE_TAG"; then
      die "healthcheck publik gagal; sudah rollback ke $PREVIOUS_TAG"
    fi
    die "healthcheck publik gagal"
  fi
else
  log "healthcheck publik dilewati (PUBLIC_HEALTH_URL tidak diisi)"
fi

if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$IMAGE_TAG" ]]; then
  write_tag "$PREVIOUS_FILE" "$PREVIOUS_TAG"
fi
write_tag "$CURRENT_FILE" "$IMAGE_TAG"
printf '%s deploy %s ok\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$IMAGE_TAG" >> "$HISTORY_FILE"

log "deploy selesai: $IMAGE_TAG"
