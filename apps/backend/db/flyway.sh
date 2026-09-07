#!/bin/sh
# Runs the Flyway CLI against the database src/config.ts would connect to, with
# the settings this repo needs. The Makefile, CI and the migrator container all
# go through here, so the configuration exists once.
#
#   ./flyway.sh migrate
#   ./flyway.sh info
#   ./flyway.sh validate
#
# Uses the flyway on PATH (the migrator image has one) and otherwise the pinned
# image, so a laptop and a CI runner need docker and nothing else.
set -eu

FLYWAY_IMAGE=flyway/flyway:13.5.0-alpine
DB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Adopting the pre-Flyway database: everything at or below this version is
# already applied on production, so Flyway baselines instead of re-running it.
# It is the last migration that shipped under kysely's Migrator and never moves;
# a new migration sorts above it and applies normally.
BASELINE_VERSION=20260906215733

# Same precedence as src/config.ts: DATABASE_URL wins, otherwise the discrete
# DB_* vars with the docker-compose defaults. Percent-encoded credentials in
# DATABASE_URL are not decoded -- pass those through DB_USER/DB_PASSWORD.
if [ -n "${DATABASE_URL:-}" ]; then
  rest=${DATABASE_URL#*://}
  case "$rest" in
    *@*) creds=${rest%%@*} ; hostpath=${rest#*@} ;;
    *)   creds=''          ; hostpath=$rest      ;;
  esac
  db_user=${creds%%:*}
  case "$creds" in *:*) db_password=${creds#*:} ;; *) db_password='' ;; esac
  hostport=${hostpath%%/*}
  db_name=${hostpath#*/}
  db_name=${db_name%%\?*}
  db_host=${hostport%%:*}
  case "$hostport" in *:*) db_port=${hostport#*:} ;; *) db_port=5432 ;; esac
else
  db_user=${DB_USER:-branch_dev}
  db_password=${DB_PASSWORD:-password}
  db_host=${DB_HOST:-localhost}
  db_port=${DB_PORT:-5432}
  db_name=${DB_NAME:-branch_db}
fi

# TLS, mirroring src/config.ts: a CA bundle means full verification (CI reaches
# RDS over the public internet), DB_SSL alone means encrypted-but-unverified.
ca_path=${DB_SSL_CA:-}
if [ -n "$ca_path" ]; then
  ssl='?sslmode=verify-full&sslrootcert='
elif [ "${DB_SSL:-}" = 'true' ]; then
  ssl='?sslmode=require'
else
  ssl=''
fi

# -outOfOrder: two contributors' migrations sometimes merge out of timestamp
#   order (Alice authors first, Bob merges first). Without it the next deploy
#   fails and can only be unblocked by hand-editing the history table.
# -cleanDisabled: `flyway clean` drops the schema. Nothing here ever wants it,
#   and it is one typo away from production.
# -placeholders.async: empty on PostgreSQL, ASYNC on Aurora DSQL, which has no
#   synchronous CREATE INDEX. Keeps one migration corpus valid on both engines.
add_flags() {
  set -- \
    "-locations=filesystem:$1" \
    -schemas=branch \
    -defaultSchema=branch \
    -createSchemas=true \
    -outOfOrder=true \
    -baselineOnMigrate=true \
    "-baselineVersion=$BASELINE_VERSION" \
    -validateMigrationNaming=true \
    -cleanDisabled=true \
    "-placeholders.async=${FLYWAY_PLACEHOLDER_ASYNC:-}"
  printf '%s\n' "$@"
}

if command -v flyway >/dev/null 2>&1; then
  [ -z "$ca_path" ] || ssl="${ssl}${ca_path}"
  # shellcheck disable=SC2046  # deliberate word splitting: one flag per line
  set -- flyway $(add_flags "$DB_DIR/migrations") "$@"
else
  ca_mount=''
  if [ -n "$ca_path" ]; then
    ssl="${ssl}/rds-ca.pem"
    ca_mount="--volume=$ca_path:/rds-ca.pem:ro"
  fi
  # --network=host so localhost:5432 means the same thing inside the container
  # as outside it -- that is where compose and the CI postgres service listen.
  # shellcheck disable=SC2046
  set -- docker run --rm --network=host \
    --volume="$DB_DIR/migrations:/db/migrations:ro" \
    --env=FLYWAY_URL --env=FLYWAY_USER --env=FLYWAY_PASSWORD \
    ${ca_mount:+"$ca_mount"} "$FLYWAY_IMAGE" \
    $(add_flags /db/migrations) "$@"
fi

# Credentials go through the environment, never argv: `docker run` arguments are
# visible to every process on the host, and Flyway echoes its own command line.
FLYWAY_URL="jdbc:postgresql://${db_host}:${db_port}/${db_name}${ssl}"
FLYWAY_USER=$db_user
FLYWAY_PASSWORD=$db_password
export FLYWAY_URL FLYWAY_USER FLYWAY_PASSWORD

exec "$@"
