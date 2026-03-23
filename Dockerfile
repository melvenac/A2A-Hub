FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY convex/ ./convex/

RUN npx tsc

FROM node:20-alpine

WORKDIR /app

# Install git for repo-fixer
RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist/ ./dist/
COPY convex/ ./convex/

EXPOSE 4000

CMD ["node", "dist/index.js"]
