# One-shot migration runner, built from the repo root like the lambdas.
#
# Based on the Flyway image rather than bolting Flyway onto node:20-alpine: it
# already carries a JDK, the PostgreSQL JDBC driver, and /flyway/drivers, which
# is where the Aurora DSQL JDBC connector goes when we cut over.
#
# node is still here because flyway only migrates: seeding, the schema rebuild
# and type generation stay in src/cli.ts.
FROM flyway/flyway:13.5.0-alpine

RUN apk add --no-cache nodejs npm

WORKDIR /db

COPY apps/backend/db/package.json apps/backend/db/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/backend/db/tsconfig.json apps/backend/db/testkit.ts apps/backend/db/seed.sql apps/backend/db/flyway.sh ./
COPY apps/backend/db/src ./src
COPY apps/backend/db/migrations ./migrations

# The base image runs /flyway/flyway as its entrypoint, which would prepend
# `flyway` to every compose `command:`.
ENTRYPOINT []
CMD ["npm", "run", "migrate"]
