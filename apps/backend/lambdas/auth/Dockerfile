FROM node:20-alpine

WORKDIR /shared/types

# Copy shared types (required by auth lambda)
COPY shared/types/package.json ./
COPY shared/types/ ./

WORKDIR /app

# Copy package files
COPY apps/backend/lambdas/auth/package*.json ./

# Install dependencies
RUN npm install --no-package-lock

# Copy source files
COPY apps/backend/lambdas/auth/ .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/auth/health || exit 1

# Start the dev server
CMD ["npm", "run", "dev"]
