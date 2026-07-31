#!/bin/bash

PROJECT_DIR="/home/mingas/projeto_DOMINIUM"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_LOG="/tmp/dominium-backend.log"
FRONTEND_LOG="/tmp/dominium-frontend.log"

NPM_BIN=$(command -v npm 2>/dev/null)

is_up() {
  curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "$1" 2>/dev/null
}

stop_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    sleep 2
  fi
}

wait_for() {
  local url="$1" label="$2" max="${3:-30}" i=1
  while [ $i -le $max ]; do
    local code
    code=$(is_up "$url")
    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
      echo "$label pronto em ${i}s."
      return 0
    fi
    sleep 1
    i=$((i+1))
  done
  echo "Aviso: $label não respondeu em ${max}s."
  return 1
}

echo "💰 Iniciando DOMINIUM..."

# Encerra processos antigos (evita EADDRINUSE)
stop_port 5001
stop_port 5000

# ── Backend (modo dev: reinicia automaticamente ao salvar) ───────────────
echo "Iniciando backend (dev)..."
nohup "$NPM_BIN" --prefix "$BACKEND_DIR" run dev > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# ── Frontend (modo dev: hot reload com Turbopack) ────────────────────────
echo "Iniciando frontend (dev)..."
nohup "$NPM_BIN" --prefix "$FRONTEND_DIR" run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Aguarda backend (max 20s)
wait_for "http://127.0.0.1:5001/api/health" "Backend" 20 || true

# Aguarda frontend (max 30s)
wait_for "http://127.0.0.1:5000/login" "Frontend" 30 || true

# Abre o browser
xdg-open "http://localhost:5000" >/dev/null 2>&1 \
  || gio open "http://localhost:5000" >/dev/null 2>&1 \
  || python3 -m webbrowser "http://localhost:5000" >/dev/null 2>&1 \
  || true

echo "✅ DOMINIUM pronto."
echo "   Frontend: http://localhost:5000"
echo "   Backend:  http://localhost:5001"
echo "   Logs:     $BACKEND_LOG  |  $FRONTEND_LOG"
