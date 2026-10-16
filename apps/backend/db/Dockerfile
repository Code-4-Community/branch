# One-shot migration runner, built from the repo root like the lambdas.
FROM flyway/flyway:13.5.0-alpine

# Same pin as flyway.sh.
ADD --checksum=sha256:2d5b8e3f16732afc70e6bd096c4817f8967f7e755c4e38d5f604ca85cfacdc89 \
    https://repo1.maven.org/maven2/org/flywaydb/flyway-database-dsql/10.26.0/flyway-database-dsql-10.26.0.jar \
    /flyway/drivers/flyway-database-dsql.jar

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
