FROM node:20-alpine

# Build context is the repo root (see docker-compose.yml) so the file: shared
# deps resolve. Build the shared HTTP router into /shared/lambda-http first.
WORKDIR /shared/lambda-http
COPY shared/lambda-http/package.json shared/lambda-http/tsconfig.json ./
COPY shared/lambda-http/src ./src/
RUN npm install && npm run build

WORKDIR /app
COPY apps/backend/lambdas/auth/package*.json ./
RUN npm install --no-package-lock
COPY apps/backend/lambdas/auth/ .

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/auth/health || exit 1

# Start the dev server
CMD ["npm", "run", "dev"]
