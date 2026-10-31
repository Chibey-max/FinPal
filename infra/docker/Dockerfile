FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
# Mobile's manifest keeps the frozen lockfile consistent; its packages
# are not installed (the filter below only takes the web app's graph).
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter "@finpal/web..."

FROM dependencies AS builder
# NEXT_PUBLIC_* values are inlined into client bundles at build time.
# Render passes service environment variables as build args.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
COPY . .
RUN pnpm --filter @finpal/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Applied by the server on start (apps/web/src/instrumentation.ts).
COPY --from=builder --chown=nextjs:nodejs /app/db/migrations ./db/migrations
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
