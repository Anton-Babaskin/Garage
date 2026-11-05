#!/usr/bin/env bash
# Установка / обновление «Гаража» на своём сервере (Ubuntu 24.04 + Docker).
#   Первый раз:  curl -fsSL https://raw.githubusercontent.com/Anton-Babaskin/Garage/main/deploy/install.sh | bash
#   Обновление:  /opt/garage/deploy/install.sh
# Спросит домен, SITE_KEY и ADMIN_PIN только при первом запуске; хранит их в deploy/docker/.env (chmod 600).
set -euo pipefail

DIR="${GARAGE_DIR:-/opt/garage}"
REPO="${GARAGE_REPO:-https://github.com/Anton-Babaskin/Garage.git}"
say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

command -v docker >/dev/null || { echo "Нет Docker. Поставьте: curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker \$USER (и перелогиньтесь)"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нет docker compose v2."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Нет доступа к Docker. Выполните: sudo usermod -aG docker \$USER и перелогиньтесь."; exit 1; }

say "Код: $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  sudo mkdir -p "$DIR" && sudo chown "$(id -u):$(id -g)" "$DIR"
  git clone "$REPO" "$DIR"
fi
cd "$DIR/deploy/docker"

if [ ! -f .env ]; then
  say "Настройки (один раз)"
  read -rp "Домен для сайта (для теста: new.autozxc.app): " DOMAIN </dev/tty
  read -rp "SITE_KEY — 12 латинских букв/цифр, как в Replit → Secrets: " SITE_KEY </dev/tty
  read -rsp "ADMIN_PIN — PIN Антона, как в Replit → Secrets (ввод скрыт): " ADMIN_PIN </dev/tty; echo
  clean() { printf '%s' "$1" | tr -d '\r\t \n'; }
  DOMAIN="$(clean "$DOMAIN" | tr 'A-Z' 'a-z')"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
  SITE_KEY="$(clean "$SITE_KEY")"; ADMIN_PIN="$(clean "$ADMIN_PIN")"
  [[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || { echo "Неверный домен: '$DOMAIN'"; exit 1; }
  [[ "$SITE_KEY" =~ ^[A-Za-z0-9]{12}$ ]] || { echo "SITE_KEY должен быть ровно 12 латинских букв/цифр"; exit 1; }
  [ -n "$ADMIN_PIN" ] || { echo "ADMIN_PIN пустой"; exit 1; }
  ( umask 077; printf 'DOMAIN=%s\nSITE_KEY=%s\nADMIN_PIN=%s\n' "$DOMAIN" "$SITE_KEY" "$ADMIN_PIN" > .env )
fi
DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"

say "Папка данных"
mkdir -p "$DIR/data"
[ "$(stat -c %u "$DIR/data")" = "1000" ] || sudo chown -R 1000:1000 "$DIR/data"
sudo chmod 700 "$DIR/data"

say "Сборка и запуск"
docker compose up -d --build
docker image prune -f >/dev/null || true

say "Проверка"
for i in $(seq 1 30); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1; then ok=1; break; fi; sleep 1
done
[ "${ok:-}" = 1 ] && echo "✓ Приложение отвечает внутри контейнера" || { echo "✗ Приложение не ответило. Логи: docker compose -f $DIR/deploy/docker/docker-compose.yml logs app --tail 50"; exit 1; }
if curl -fsS -m 20 "https://$DOMAIN/healthz" >/dev/null 2>&1; then
  echo "✓ https://$DOMAIN/healthz доступен — сертификат получен"
else
  echo "… https://$DOMAIN пока не отвечает. Если только что поставили DNS/проброс — подождите минуту."
  echo "  Логи Caddy: docker compose -f $DIR/deploy/docker/docker-compose.yml logs caddy --tail 30"
fi
echo
echo "Готово. Версия: $(grep -o 'APP_VERSION=[0-9]*' "$DIR/public/ui.js")"
