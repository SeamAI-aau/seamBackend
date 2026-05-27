# Seam API — production image (build context: seamBackend/)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY api/src/prisma ./api/src/prisma
COPY api/prisma.config.ts ./api/prisma.config.ts

RUN npm ci --ignore-scripts

# Full source (nx, webpack, tsconfig) — excludes node_modules via .dockerignore
COPY api ./api
COPY api-e2e ./api-e2e
COPY nx.json tsconfig.base.json tsconfig.json ./

RUN cd api && npx prisma generate
RUN npx nx sync
RUN npm run build:api

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY api/src/prisma ./api/src/prisma
COPY api/prisma.config.ts ./api/prisma.config.ts

RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
