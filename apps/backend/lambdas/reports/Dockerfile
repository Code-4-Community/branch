FROM node:20-alpine

WORKDIR /shared/lambda-auth
COPY shared/lambda-auth/package.json shared/lambda-auth/tsconfig.json ./
COPY shared/lambda-auth/src ./src/
RUN npm install && npm run build

WORKDIR /shared/lambda-http
COPY shared/lambda-http/package.json shared/lambda-http/tsconfig.json ./
COPY shared/lambda-http/src ./src/
RUN npm install && npm run build

WORKDIR /app
COPY apps/backend/lambdas/reports/package*.json ./
RUN npm install --no-package-lock
COPY apps/backend/lambdas/reports/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/reports/health || exit 1

CMD ["npm", "run", "dev"]
