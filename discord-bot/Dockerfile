# Works on any Docker host (Oracle/Google Cloud VM, Koyeb, Render, a home server…)
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# The JSON database lives here — mount a volume to keep data between deploys.
VOLUME ["/app/data"]
EXPOSE 3000
ENV PORT=3000
CMD ["node", "src/index.js"]
