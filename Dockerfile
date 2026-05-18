# Multi-stage Dockerfile for production.
# Builds the React frontend to /app/dist, the Node server to /app/dist-server,
# and runs the compiled server (which serves both API and static frontend).

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
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Default DB location — override with DB_PATH for persistence
RUN mkdir -p /var/data
ENV DB_PATH=/var/data/homechef.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
