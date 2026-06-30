FROM node:20-alpine

WORKDIR /shared/types
COPY shared/types/package.json ./
COPY shared/types/ ./

WORKDIR /app
COPY apps/backend/lambdas/auth/package*.json ./
RUN npm install --no-package-lock
COPY apps/backend/lambdas/auth/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/auth/health || exit 1

CMD ["npm", "run", "dev"]
