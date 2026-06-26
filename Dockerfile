# syntax=docker/dockerfile:1
ARG BUN_VERSION=1
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /usr/src/app

# Install production dependencies in a separate stage so the layer
# is cached as long as package.json / bun.lock are unchanged.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Final runtime image: production deps + source. Bun runs TypeScript
# directly, so there is no separate build step.
FROM base AS release
ARG GIT_COMMIT=""
ENV NODE_ENV=production
ENV GIT_COMMIT=${GIT_COMMIT}
# ffmpeg transcodes Telegram ogg/opus voice notes to mp3 before they're sent to
# the AI endpoint (the OpenAI-compatible input_audio field accepts only wav/mp3).
RUN apk add --no-cache ffmpeg
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

USER bun
EXPOSE 8080/tcp
# Belt-and-braces alongside the compose-level healthcheck: lets `docker run`
# and orchestrators outside compose see the same liveness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1
CMD ["bun", "run", "src/main.ts"]
