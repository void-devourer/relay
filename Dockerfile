FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 RELAY_DB_PATH=/app/data/relay.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
RUN mkdir data && chown -R node:node /app
USER node
EXPOSE 4317
CMD ["node", "server/index.mjs"]
