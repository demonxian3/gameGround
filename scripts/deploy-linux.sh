#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/arcadia-grid}"
SERVICE_NAME="${SERVICE_NAME:-arcadia-grid}"
SERVER_NAME="${SERVER_NAME:-localhost 127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
RUN_USER="${RUN_USER:-www-data}"
RUN_GROUP="${RUN_GROUP:-www-data}"
NODE_BIN="${NODE_BIN:-}"

if [[ -z "${NODE_BIN}" ]]; then
  for candidate in /usr/local/bin/node /usr/bin/node "$(command -v node || true)"; do
    if [[ -n "${candidate}" && -x "${candidate}" ]]; then
      NODE_BIN="${candidate}"
      break
    fi
  done
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found; install Node.js 20+ first" >&2
  exit 1
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found; install Node.js 20+ first" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found; this script targets systemd-based Linux hosts" >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not found; install nginx first" >&2
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "run this script from the project root" >&2
  exit 1
fi

echo "[1/5] Installing dependencies"
npm ci

echo "[2/5] Building backend"
npm run build:backend

echo "[3/5] Installing systemd service"
sed \
  -e "s#__APP_ROOT__#${APP_ROOT}#g" \
  -e "s#__BACKEND_PORT__#${BACKEND_PORT}#g" \
  -e "s#__RUN_USER__#${RUN_USER}#g" \
  -e "s#__RUN_GROUP__#${RUN_GROUP}#g" \
  -e "s#__NODE_BIN__#${NODE_BIN}#g" \
  deploy/systemd/arcadia-grid.service | sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null

echo "[4/5] Installing nginx site"
sed \
  -e "s#__APP_ROOT__#${APP_ROOT}#g" \
  -e "s#__BACKEND_PORT__#${BACKEND_PORT}#g" \
  -e "s#__SERVER_NAME__#${SERVER_NAME}#g" \
  deploy/nginx/arcadia-grid.conf | sudo tee "/etc/nginx/sites-available/${SERVICE_NAME}" >/dev/null

sudo ln -sf "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
sudo nginx -t

echo "[5/5] Restarting services"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl reload nginx

echo "deployment finished"
echo "health check:"
for _ in {1..10}; do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health"; then
    exit 0
  fi
  sleep 1
done

echo "backend health check failed after waiting for startup" >&2
exit 1
