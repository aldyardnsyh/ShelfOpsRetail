# Web ShelfOps untuk deployment Docker satu domain.
#
# Build dari root repo (monorepo npm workspaces):
#   docker build -f apps/web/Dockerfile .
#
# Profil demo statis juga bisa dibangun dari image ini:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_DEMO_MODE=1 .

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_DEMO_MODE=0
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_API_SAME_ORIGIN=0
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_SAME_ORIGIN=$NEXT_PUBLIC_API_SAME_ORIGIN
RUN npm run build --workspace packages/api-client \
 && npm run build --workspace apps/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]