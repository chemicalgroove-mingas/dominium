#!/usr/bin/env bash
set -euo pipefail

BASE="$HOME/projeto_DOMINIUM"
LOG="$BASE/.logs"
mkdir -p "$LOG"

# 1. libera as portas (encerra instancias anteriores) — evita EADDRINUSE
fuser -k 5000/tcp 2>/dev/null || true   # frontend
fuser -k 5001/tcp 2>/dev/null || true   # backend
sleep 1

# 2. sobe backend e frontend em segundo plano, sem janela de terminal
if ! curl -s http://localhost:5001 >/dev/null 2>&1; then
  ( cd "$BASE/backend" && nohup npm run dev > "$LOG/backend.log" 2>&1 & )
fi
( cd "$BASE/frontend" && nohup npm run dev > "$LOG/frontend.log" 2>&1 & )

# 3. espera o frontend subir (timeout ~30s) e abre o navegador
for i in $(seq 1 30); do
  if curl -s http://localhost:5000 >/dev/null 2>&1; then break; fi
  sleep 1
done

xdg-open http://localhost:5000 >/dev/null 2>&1 &
