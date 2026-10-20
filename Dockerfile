FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
EXPOSE 3000
# Create/upgrade tables on start (non-destructive), then serve on all interfaces.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
