FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/queues/package.json ./packages/queues/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages

FROM base AS build
RUN pnpm build

FROM node:24-alpine AS web
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]

FROM base AS tools
ENV NODE_ENV=production
