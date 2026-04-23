FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run prisma:generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY Sutra-Logo.svg ./Sutra-Logo.svg

RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
