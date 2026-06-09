FROM node:20-alpine

# Build shared auth package (file:../../../../shared/lambda-auth from /app resolves to /shared/lambda-auth)
WORKDIR /shared/lambda-auth
COPY shared/lambda-auth/package.json shared/lambda-auth/tsconfig.json ./
COPY shared/lambda-auth/src ./src/
RUN npm install && npm run build

WORKDIR /app
COPY apps/backend/lambdas/projects/package*.json ./
RUN npm install --no-package-lock
COPY apps/backend/lambdas/projects/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/projects/health || exit 1

CMD ["npm", "run", "dev"]
