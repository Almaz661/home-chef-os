# Multi-stage Dockerfile for production.
# Builds the React frontend to /app/dist, then runs the server with tsx
# (TS-on-the-fly). The server lives in server/ and serves both the API
# and the static frontend at dist/.

FROM node:22-alpine AS builder

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./

# Default DB location — override with DB_PATH for persistence
RUN mkdir -p /var/data
ENV DB_PATH=/var/data/homechef.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
