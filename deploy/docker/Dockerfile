# Сборка из корня проекта: docker compose -f deploy/docker/docker-compose.yml up -d --build
FROM node:22-alpine
ENV NODE_ENV=production TZ=Europe/Istanbul DATA_DIR=/data PORT=8080
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --chown=node:node package.json server.js core.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/import.cjs ./scripts/import.cjs
RUN npm install --omit=dev --no-audit --no-fund
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
