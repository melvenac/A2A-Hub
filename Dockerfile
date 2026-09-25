FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY convex/ ./convex/

RUN npx tsc && cp -r convex/_generated dist/convex/_generated

# The chat client, served by the hub at /ui/ (src/ui.ts). Its own stage so the
# client's dev dependencies never reach the runtime image.
FROM node:20-alpine AS client

WORKDIR /client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install git for repo-fixer
RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist/ ./dist/
COPY convex/ ./convex/
COPY --from=client /client/dist/ ./client/dist/

EXPOSE 4000

CMD ["node", "dist/src/index.js"]
