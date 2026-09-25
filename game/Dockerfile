# Deep Waters game server (serves the web client + WebSocket multiplayer on one port)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY shared ./shared
COPY client ./client
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/server.js"]
