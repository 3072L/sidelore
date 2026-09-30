FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.json ./
RUN npm ci && npm run build && npm run build:web && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir /data && chown node:node /data
USER node
ENV SIDELORE_DATA_DIR=/data
EXPOSE 8788 4001
CMD ["node", "dist/apps/node/src/run.js"]
