# Cap Web - Production Docker Image
# Building from local source with Firefox/Safari fixes

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .

RUN corepack enable pnpm
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm i --frozen-lockfile

ARG NEXT_PUBLIC_DOCKER_BUILD=true
ENV NEXT_PUBLIC_WEB_URL=http://localhost:3000

RUN pnpm run build:web

# Production image
FROM base AS runner
WORKDIR /app

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy built files
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/migrations ./apps/web/migrations

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

CMD HOSTNAME="0.0.0.0" node apps/web/server.js
