# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.34.6
# Cache dependency installation independently from application edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/challenge-sdk/package.json ./packages/challenge-sdk/package.json
COPY packages/challenge-browser/package.json ./packages/challenge-browser/package.json
COPY packages/challenge-mathematics/package.json ./packages/challenge-mathematics/package.json
COPY packages/challenge-science/package.json ./packages/challenge-science/package.json
RUN pnpm install --frozen-lockfile
COPY . .
# Only the public Clerk key belongs in the build. Secrets are runtime variables.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec turbo run build --filter=@mimix/web...

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3100
COPY --from=build --chown=node:node /app/apps/web/.next/standalone/ ./
COPY --from=build --chown=node:node /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=build --chown=node:node /app/apps/web/public/ ./apps/web/public/
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
