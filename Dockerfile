FROM node:22-alpine AS client-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server/src/ ./src/
COPY --chown=node:node --from=client-build /app/client/dist/ /app/client/dist/

USER node
EXPOSE 4000

CMD ["node", "src/index.js"]
