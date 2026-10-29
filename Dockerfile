FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM build AS migrate
CMD ["node", "scripts/production-entry.mjs", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS api
ENV NODE_ENV=production
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /var/lib/zendix/keys && chown node:node /var/lib/zendix/keys
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/apps/api/src/main.js"]

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/proxy-headers.conf /etc/nginx/proxy-headers.conf
COPY --from=build /workspace/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080

FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS gateway
COPY deploy/Caddyfile /etc/caddy/Caddyfile
RUN cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy && chown -R 1000:1000 /data /config
USER 1000:1000
