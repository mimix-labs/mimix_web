FROM node:22-alpine AS base

RUN npm install --global pnpm@10.34.6
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

FROM base AS client-build
RUN pnpm install --frozen-lockfile
COPY turbo.json ./
COPY client/ ./client/
RUN pnpm build

FROM base AS production-deps
RUN pnpm --filter mimix-server install --frozen-lockfile --prod

FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app/server

# Preserve pnpm's relative symlinks into /app/node_modules/.pnpm.
COPY --from=production-deps /app/node_modules/ /app/node_modules/
COPY --from=production-deps /app/server/node_modules/ ./node_modules/
COPY server/package.json ./
COPY --chown=node:node server/src/ ./src/
COPY --chown=node:node --from=client-build /app/client/dist/ /app/client/dist/

USER node
EXPOSE 4000

CMD ["node", "src/index.js"]
