#!/usr/bin/env bash
# Helper bersama untuk script deploy. Di-source, bukan dijalankan langsung.

init_paths() {
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
  ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
  COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker-compose.prod.yml}"
  STATE_DIR="${STATE_DIR:-$REPO_ROOT/.deploy}"
  BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
  export ENV_FILE COMPOSE_FILE STATE_DIR BACKUP_DIR
}

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"
}

warn() {
  printf '[%s] PERINGATAN: %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2
}

die() {
  printf '[%s] ERROR: %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2
  exit 1
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "env file tidak ditemukan: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  POSTGRES_USER="${POSTGRES_USER:-shelfops}"
  POSTGRES_DB="${POSTGRES_DB:-shelfops}"
  export POSTGRES_USER POSTGRES_DB
}

require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || die "$name wajib diisi di $ENV_FILE"
    [[ "${!name}" != *__* ]] || die "$name masih berisi placeholder; jalankan bootstrap atau isi manual"
  done
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker tidak terpasang"
  docker compose version >/dev/null 2>&1 || die "plugin docker compose tidak tersedia"
  docker info >/dev/null 2>&1 || die "daemon docker tidak berjalan atau user tidak punya akses"
  [[ -f "$COMPOSE_FILE" ]] || die "compose file tidak ditemukan: $COMPOSE_FILE"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_postgres() {
  local timeout="${1:-120}"
  local start=$SECONDS
  until compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    (( SECONDS - start < timeout )) || return 1
    sleep 2
  done
}

wait_for_gateway() {
  local timeout="${1:-120}"
  local start=$SECONDS
  while (( SECONDS - start < timeout )); do
    if compose exec -T gateway wget -qO- http://127.0.0.1:8080/readyz >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

wait_for_url() {
  local url="$1" timeout="${2:-120}"
  local start=$SECONDS
  while (( SECONDS - start < timeout )); do
    if curl -fsS --max-time 10 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

dump_failure_logs() {
  compose ps >&2 || true
  compose logs --tail=100 --no-color gateway caddy ai-rag ai-vision >&2 || true
}

read_tag() {
  local file="$1"
  [[ -f "$file" ]] && head -n 1 "$file" || true
}

write_tag() {
  local file="$1" value="$2"
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  printf '%s\n' "$value" > "$file"
}
