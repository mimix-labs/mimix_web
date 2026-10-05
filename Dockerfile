FROM node:22-alpine AS base

RUN npm install --global pnpm@10.34.6
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/challenge-sdk/package.json ./packages/challenge-sdk/package.json
COPY packages/challenge-runtime/package.json ./packages/challenge-runtime/package.json
COPY packages/challenge-browser/package.json ./packages/challenge-browser/package.json
COPY packages/challenge-mathematics/package.json ./packages/challenge-mathematics/package.json
COPY packages/challenge-science/package.json ./packages/challenge-science/package.json

COPY packages/agent-contract/package.json ./packages/agent-contract/package.json
COPY packages/character-contract/package.json ./packages/character-contract/package.json
COPY packages/agent-core/package.json ./packages/agent-core/package.json
COPY characters/wall-e/package.json ./characters/wall-e/package.json
COPY packages/voice-contract/package.json ./packages/voice-contract/package.json
COPY packages/embodiment-contract/package.json ./packages/embodiment-contract/package.json
COPY packages/media-contract/package.json ./packages/media-contract/package.json
COPY packages/robot-protocol/package.json ./packages/robot-protocol/package.json
COPY tools/robot-simulator/package.json ./tools/robot-simulator/package.json

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY turbo.json ./
COPY packages/ ./packages/
COPY characters/ ./characters/
COPY tools/robot-simulator/ ./tools/robot-simulator/
COPY client/ ./client/
COPY server/src/ ./server/src/
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src/ ./apps/api/src/
ARG VITE_MIMIX_CHALLENGES_MODE=package
RUN pnpm build

FROM base AS production-deps
RUN pnpm --filter @mimix/api... install --frozen-lockfile --prod

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Preserve store and workspace symlinks; no package manager is needed at runtime.
COPY --from=production-deps /app/node_modules/ ./node_modules/
COPY --from=production-deps /app/server/node_modules/ ./server/node_modules/
COPY --from=production-deps /app/apps/api/node_modules/ ./apps/api/node_modules/
COPY server/package.json ./server/package.json
COPY --chown=node:node server/src/ ./server/src/
COPY apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=build /app/apps/api/dist/ ./apps/api/dist/
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY --from=production-deps /app/packages/contracts/node_modules/ ./packages/contracts/node_modules/
COPY --from=build /app/packages/contracts/dist/ ./packages/contracts/dist/
COPY packages/voice-contract/package.json ./packages/voice-contract/package.json
COPY packages/embodiment-contract/package.json ./packages/embodiment-contract/package.json
COPY --from=production-deps /app/packages/voice-contract/node_modules/ ./packages/voice-contract/node_modules/
COPY --from=build /app/packages/voice-contract/dist/ ./packages/voice-contract/dist/
COPY --from=production-deps /app/packages/embodiment-contract/node_modules/ ./packages/embodiment-contract/node_modules/
COPY --from=build /app/packages/embodiment-contract/dist/ ./packages/embodiment-contract/dist/
COPY packages/media-contract/package.json ./packages/media-contract/package.json
COPY packages/robot-protocol/package.json ./packages/robot-protocol/package.json
COPY --from=production-deps /app/packages/robot-protocol/node_modules/ ./packages/robot-protocol/node_modules/
COPY --from=build /app/packages/robot-protocol/dist/ ./packages/robot-protocol/dist/
COPY --from=production-deps /app/packages/media-contract/node_modules/ ./packages/media-contract/node_modules/
COPY --from=build /app/packages/media-contract/dist/ ./packages/media-contract/dist/
COPY --chown=node:node apps/api/migrations/ ./apps/api/migrations/
COPY --chown=node:node --from=build /app/client/dist/ ./client/dist/

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
