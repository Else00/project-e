# syntax=docker/dockerfile:1.7

ARG BUN_VERSION=1.3.6
ARG NGINX_VERSION=1.29-alpine-slim

FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY index.html ./
COPY tsconfig*.json ./
COPY vite.config.ts vitest.config.ts playwright.config.ts biome.json ./
COPY public ./public
COPY src ./src
RUN --mount=type=cache,target=/app/node_modules/.vite \
  bun run build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS serve
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
