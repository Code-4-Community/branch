# One-shot migration runner, built from the repo root like the lambdas.
#
# A Dockerfile rather than bind-mounting the repo into node:20-alpine and running
# `npm ci` on every `up`: that would clobber the host's apps/backend/db/node_modules
# with alpine-built artifacts and cost ~30s per start. This way docker caches the
# install layer.
FROM node:20-alpine

WORKDIR /db

COPY apps/backend/db/package.json apps/backend/db/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/backend/db/tsconfig.json apps/backend/db/testkit.ts apps/backend/db/seed.sql ./
COPY apps/backend/db/src ./src
COPY apps/backend/db/migrations ./migrations

CMD ["npm", "run", "migrate"]
