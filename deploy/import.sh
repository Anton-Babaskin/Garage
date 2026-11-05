#!/usr/bin/env bash
# Залить «Скачать полную копию» (garage-export-*.json) в Гараж на этом сервере.
#   ./deploy/import.sh ~/garage-export-2026-11-05.json            — в пустой сервер
#   ./deploy/import.sh ~/garage-export-2026-11-05.json --force    — перезаписать текущие данные (перед этим делается копия папки data)
set -euo pipefail
DIR="${GARAGE_DIR:-/opt/garage}"
SRC="$(readlink -f "${1:?Укажите файл выгрузки}")"; shift || true
[ -f "$SRC" ] || { echo "Нет файла $SRC"; exit 1; }
cd "$DIR/deploy/docker"

if [ "${1:-}" = "--force" ] && [ -f "$DIR/data/state.json" ]; then
  B="$DIR/data-before-import-$(date +%Y%m%d-%H%M%S).tar.gz"
  sudo tar -czf "$B" -C "$DIR" data && echo "Копия текущих данных: $B"
fi

docker compose stop app
docker compose run --rm --no-deps -v "$SRC:/import.json:ro" app node scripts/import.cjs /import.json "$@"
docker compose start app
sleep 2
docker compose exec -T app wget -qO- http://127.0.0.1:8080/healthz && echo
