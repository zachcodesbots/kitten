FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc --skipLibCheck

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y fontconfig && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/schema.sql ./dist/db/schema.sql
COPY --from=builder /app/src/assets ./dist/assets
RUN mkdir -p /usr/local/share/fonts && \
    cp /app/dist/assets/TikTokSans-Medium.ttf /usr/local/share/fonts/ && \
    fc-cache -fv
EXPOSE 4000
CMD ["node", "dist/index.js"]