#!/bin/bash

PROJECT_DIR="/home/mingas/projeto_DOMINIUM"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

is_up() {
  curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "$1" 2>/dev/null
}

stop_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
}

wait_for() {
  local url="$1" label="$2" max="${3:-30}" i=1
  while [ $i -le $max ]; do
    local code
    code=$(is_up "$url")
    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
      echo "$label pronto em ${i}s."
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "Aviso: $label não respondeu em ${max}s."
  return 1
}

echo "💰 Iniciando DOMINIUM..."

stop_port 5001
stop_port 5000

if command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal --title="DOMINIUM - Backend (5001)" -- bash -c "cd '$BACKEND_DIR' && npm run dev; exec bash"
  gnome-terminal --title="DOMINIUM - Frontend (5000)" -- bash -c "cd '$FRONTEND_DIR' && npm run dev; exec bash"
elif command -v xterm >/dev/null 2>&1; then
  xterm -T "DOMINIUM - Backend (5001)" -e bash -c "cd '$BACKEND_DIR' && npm run dev; exec bash" &
  xterm -T "DOMINIUM - Frontend (5000)" -e bash -c "cd '$FRONTEND_DIR' && npm run dev; exec bash" &
else
  echo "Nenhum emulador de terminal encontrado, iniciando em segundo plano."
  nohup npm --prefix "$BACKEND_DIR" run dev > /tmp/dominium-backend.log 2>&1 &
  nohup npm --prefix "$FRONTEND_DIR" run dev > /tmp/dominium-frontend.log 2>&1 &
fi

wait_for "http://127.0.0.1:5001/api/health" "Backend" 25 || true
wait_for "http://127.0.0.1:5000/login" "Frontend" 30 || true

xdg-open "http://localhost:5000" >/dev/null 2>&1 \
  || gio open "http://localhost:5000" >/dev/null 2>&1 \
  || python3 -m webbrowser "http://localhost:5000" >/dev/null 2>&1 \
  || true

echo "✅ DOMINIUM pronto."
echo "   Frontend: http://localhost:5000"
echo "   Backend:  http://localhost:5001"
