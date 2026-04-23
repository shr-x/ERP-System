FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 80

CMD ["node", "server.mjs", "--port", "80", "--target", "http://backend:4000", "--apiPrefix", "/api", "--staticDir", "dist"]
