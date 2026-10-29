#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

DOMAIN="${SHELFOPS_HOST:-${SHELFOPS_DOMAIN:-}}"
WEB_URL="${WEB_BASE_URL:-https://${DOMAIN}}"
ACME_EMAIL="${ACME_EMAIL:-}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/shelfops}"
REPO_URL="${REPO_URL:-https://github.com/aldyardnsyh/ShelfOpsRetail.git}"
BRANCH="${BRANCH:-main}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-1}"
SKIP_CLONE="${SKIP_CLONE:-0}"
SWAP_ONLY="${SWAP_ONLY:-0}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

usage() {
  cat <<'EOF'
Pakai: sudo bootstrap-vps.sh [opsi]

Opsi:
  --domain DOMAIN     Domain dasar, api.<DOMAIN> dipakai untuk API (wajib)
  --web-url URL       URL web Vercel (default: https://shelfops.<DOMAIN>)
  --email EMAIL       Email ACME (default: admin@<DOMAIN>)
  --repo URL          URL git repo
  --dir PATH          Direktori aplikasi (default: /opt/shelfops)
  --user NAME         User deploy non-root (default: deploy)
  --branch NAME       Branch git (default: main)
  --no-fail2ban       Jangan pasang fail2ban
  --skip-clone        Jangan clone/pull repo
  --swap-only         Hanya siapkan swap lalu keluar
  -h, --help          Bantuan

Script harus dijalankan sebagai root di Ubuntu 24.04.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --domain) [[ $# -ge 2 ]] || die "--domain butuh nilai"; DOMAIN="$2"; shift 2 ;;
    --web-url) [[ $# -ge 2 ]] || die "--web-url butuh nilai"; WEB_URL="$2"; shift 2 ;;
    --email) [[ $# -ge 2 ]] || die "--email butuh nilai"; ACME_EMAIL="$2"; shift 2 ;;
    --repo) [[ $# -ge 2 ]] || die "--repo butuh nilai"; REPO_URL="$2"; shift 2 ;;
    --dir) [[ $# -ge 2 ]] || die "--dir butuh nilai"; APP_DIR="$2"; shift 2 ;;
    --user) [[ $# -ge 2 ]] || die "--user butuh nilai"; DEPLOY_USER="$2"; shift 2 ;;
    --branch) [[ $# -ge 2 ]] || die "--branch butuh nilai"; BRANCH="$2"; shift 2 ;;
    --no-fail2ban) ENABLE_FAIL2BAN=0; shift ;;
    --skip-clone) SKIP_CLONE=1; shift ;;
    --swap-only) SWAP_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opsi tidak dikenal: $1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || die "jalankan dengan sudo/root"

export DEBIAN_FRONTEND=noninteractive

apt_base() {
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg openssl ufw
}

setup_swap() {
  if swapon --show | grep -q .; then
    log "swap sudah aktif"
  else
    log "membuat swap ${SWAP_SIZE}"
    if [[ ! -f /swapfile ]]; then
      if ! fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null; then
        dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
      fi
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null
    fi
    swapon /swapfile
  fi

  grep -q '^/swapfile[[:space:]]' /etc/fstab \
    || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab

  sysctl -w vm.swappiness=10 >/dev/null
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-shelfops.conf
}

setup_user() {
  if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    log "membuat user $DEPLOY_USER"
    useradd --create-home --shell /bin/bash "$DEPLOY_USER"
  fi

  install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

  if [[ -f /root/.ssh/authorized_keys && ! -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
    install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
      /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
    log "menyalin authorized_keys root ke $DEPLOY_USER"
  fi

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$DEPLOY_USER"
  fi
}

install_docker() {
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    log "memasang Docker Engine dari repo resmi"
    install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
    fi

    # shellcheck disable=SC1091
    . /etc/os-release
    local arch
    arch="$(dpkg --print-architecture)"
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
      "$arch" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y --no-install-recommends \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  systemctl enable --now docker

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$DEPLOY_USER"
  fi
}

setup_docker_daemon() {
  local target=/etc/docker/daemon.json
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
JSON

  if [[ -f "$target" ]] && cmp -s "$tmp" "$target"; then
    rm -f "$tmp"
    return
  fi

  install -d -m 0755 /etc/docker
  if [[ -f "$target" ]]; then
    cp -a "$target" "${target}.bak.$(date -u +%Y%m%d%H%M%S)"
  fi
  install -m 0644 "$tmp" "$target"
  rm -f "$tmp"
  systemctl restart docker
  log "konfigurasi daemon Docker diterapkan"
}

setup_firewall() {
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  log "UFW aktif: 22 (SSH), 80, 443"
}

setup_fail2ban() {
  if [[ "$ENABLE_FAIL2BAN" != "1" ]]; then
    log "fail2ban dilewati"
    return
  fi

  apt-get install -y --no-install-recommends fail2ban
  cat > /etc/fail2ban/jail.d/shelfops.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
  systemctl enable --now fail2ban
  log "fail2ban aktif untuk sshd"
}

setup_unattended() {
  apt-get install -y --no-install-recommends unattended-upgrades
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
}

clone_repo() {
  if [[ "$SKIP_CLONE" == "1" ]]; then
    log "clone repo dilewati"
    return
  fi

  install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

  if [[ -d "$APP_DIR/.git" ]]; then
    log "memperbarui repo di $APP_DIR"
    sudo -u "$DEPLOY_USER" git -C "$APP_DIR" fetch --prune origin "$BRANCH"
    sudo -u "$DEPLOY_USER" git -C "$APP_DIR" checkout "$BRANCH"
    sudo -u "$DEPLOY_USER" git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    if [[ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
      die "$APP_DIR tidak kosong dan bukan repo git"
    fi
    log "clone $REPO_URL ke $APP_DIR"
    sudo -u "$DEPLOY_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

write_env() {
  local env_file="$APP_DIR/.env"
  local template="$APP_DIR/deploy/env.production.example"

  if [[ -f "$env_file" ]]; then
    log ".env sudah ada, tidak ditimpa"
    return
  fi
  [[ -f "$template" ]] || die "template env tidak ditemukan: $template"

  local db_password jwt_secret session_secret db_url
  db_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 48)"
  session_secret="$(openssl rand -hex 48)"
  db_url="$(printf 'postgres://%s:%s@postgres:5432/%s?sslmode=disable' \
    "shelfops" "$db_password" "shelfops")"

  cp "$template" "$env_file"
  sed -i \
    -e "s|__APP_BASE_URL__|https://${DOMAIN}|g" \
    -e "s|__WEB_BASE_URL__|${WEB_URL}|g" \
    -e "s|__SHELFOPS_HOST__|${DOMAIN}|g" \
    -e "s|__ACME_EMAIL__|${ACME_EMAIL}|g" \
    -e "s|__ADMIN_EMAIL__|${ADMIN_EMAIL:-}|g" \
    -e "s|__POSTGRES_PASSWORD__|${db_password}|g" \
    -e "s|__DATABASE_URL__|${db_url}|g" \
    -e "s|__JWT_SECRET__|${jwt_secret}|g" \
    -e "s|__SESSION_SECRET__|${session_secret}|g" \
    -e "s|__COOKIE_DOMAIN__||g" \
    -e "s|__GOOGLE_REDIRECT_URL__|https://${DOMAIN}/api/v1/auth/google/callback|g" \
    "$env_file"

  if grep -q '__[A-Z_][A-Z_]*__' "$env_file"; then
    warn "masih ada placeholder di $env_file; periksa manual"
  fi

  chown "$DEPLOY_USER:$DEPLOY_USER" "$env_file"
  chmod 600 "$env_file"
  log ".env produksi dibuat (chmod 600)"
}

link_env_for_compose() {
  local env_file="$APP_DIR/.env"
  if [[ -f "$env_file" ]]; then
    chown "$DEPLOY_USER:$DEPLOY_USER" "$env_file"
    chmod 600 "$env_file"
  fi
  if [[ ! -e "$APP_DIR/infra/.env" && ! -L "$APP_DIR/infra/.env" ]]; then
    ln -s ../.env "$APP_DIR/infra/.env"
    chown -h "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/infra/.env"
  fi
}

apt_base
setup_swap

if [[ "$SWAP_ONLY" == "1" ]]; then
  log "swap siap"
  exit 0
fi

[[ -n "$DOMAIN" ]] || die "--domain wajib diisi (contoh: --domain example.com)"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "domain tidak valid: $DOMAIN"
[[ -n "$WEB_URL" ]] || WEB_URL="https://shelfops.${DOMAIN}"
[[ -n "$ACME_EMAIL" ]] || ACME_EMAIL="admin@${DOMAIN}"

setup_user
install_docker
setup_docker_daemon
setup_firewall
setup_fail2ban
setup_unattended
clone_repo
write_env
link_env_for_compose

if [[ -d "$APP_DIR/.git" ]]; then
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.git"
fi

log "bootstrap selesai"
cat <<EOF

Langkah berikutnya:
  1. Periksa $APP_DIR/.env (API key LLM/embedding bila tidak memakai replay).
  2. Pastikan DNS: api.${DOMAIN} -> IP VPS ini.
  3. Deploy:
       sudo -u ${DEPLOY_USER} bash -lc 'cd ${APP_DIR} && bash deploy/deploy.sh'
  4. Healthcheck:
       curl -fsS https://api.${DOMAIN}/healthz
  5. Web Vercel: set NEXT_PUBLIC_API_URL=https://api.${DOMAIN}

EOF
