#!/usr/bin/env bash
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
notify-send "Dominium" "Serviços encerrados." 2>/dev/null || true
