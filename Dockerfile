# Multi-stage build for Nex MCP Server
# Supports both stdio and HTTP/Streamable transport

FROM node:22-alpine AS builder
WORKDIR /app
COPY cli/package.json cli/package-lock.json* cli/bun.lockb* ./
RUN npm install --production=false
COPY cli/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/mcp/index.js"]
