# ============================================
# IPTV Server - Production Dockerfile
# ============================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies including OpenSSL
RUN apk add --no-cache python3 make g++ openssl openssl-dev

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# ============================================
# Production image
# ============================================
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies including OpenSSL and SSH tools for deployment
RUN apk add --no-cache ffmpeg curl openssl openssh-client sshpass tar gzip

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Regenerate Prisma client for the target architecture
RUN npx prisma generate

# Create directories with proper permissions
RUN mkdir -p /tmp/hls-segments /var/log/iptv /var/cache/iptv/images && \
    chown -R nodejs:nodejs /tmp/hls-segments /var/log/iptv /var/cache/iptv

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Switch to non-root user
USER nodejs

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
