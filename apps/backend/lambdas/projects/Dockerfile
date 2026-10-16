FROM node:20-alpine

WORKDIR /shared/types
COPY shared/types/package.json ./
COPY shared/types/ ./

# Before lambda-auth: it resolves @branch/rbac as file:../rbac and needs its dist.
WORKDIR /shared/rbac
COPY shared/rbac/package.json shared/rbac/tsconfig.json ./
COPY shared/rbac/src ./src/
RUN npm install && npm run build

WORKDIR /shared/lambda-auth
COPY shared/lambda-auth/package.json shared/lambda-auth/tsconfig.json ./
COPY shared/lambda-auth/src ./src/
RUN npm install && npm run build

# After lambda-auth: lambda-http resolves it as file:../lambda-auth and needs its dist.
WORKDIR /shared/lambda-http
COPY shared/lambda-http/package.json shared/lambda-http/tsconfig.json ./
COPY shared/lambda-http/src ./src/
RUN npm install && npm run build

WORKDIR /shared/store
COPY shared/store/package.json shared/store/tsconfig.json ./
COPY shared/store/src ./src/
RUN npm install && npm run build

WORKDIR /app
COPY apps/backend/lambdas/projects/package*.json ./
RUN npm install --no-package-lock
COPY apps/backend/lambdas/projects/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/projects/health || exit 1

CMD ["npm", "run", "dev"]
