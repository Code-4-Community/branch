# One-shot migration runner, built from the repo root like the lambdas.
FROM flyway/flyway:13.5.0-alpine

RUN apk add --no-cache nodejs npm

WORKDIR /db

COPY apps/backend/db/package.json apps/backend/db/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/backend/db/tsconfig.json apps/backend/db/testkit.ts apps/backend/db/seed.sql apps/backend/db/flyway.sh ./
COPY apps/backend/db/src ./src
COPY apps/backend/db/migrations ./migrations

# The base image entrypoint would prepend `flyway` to every compose `command:`.
ENTRYPOINT []
CMD ["npm", "run", "migrate"]
