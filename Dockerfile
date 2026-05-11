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
ENV NODE_ENV=production
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

USER bun
EXPOSE 8080/tcp
CMD ["bun", "run", "src/main.ts"]
