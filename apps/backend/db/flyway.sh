#!/bin/sh
set -eu

FLYWAY_IMAGE=flyway/flyway:13.5.0-alpine
DB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Last migration applied under kysely; already on production, so Flyway baselines here.
# Also a permanent floor: anything at or below it is "Below Baseline" and never runs.
BASELINE_VERSION=20260907213524

# Off by default: on production, baselining would silently adopt an unrecognised database.
BASELINE_ON_MIGRATE=${FLYWAY_BASELINE_ON_MIGRATE:-false}

# Percent-encoded credentials in DATABASE_URL are not decoded -- use DB_USER/DB_PASSWORD.
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

ca_path=${DB_SSL_CA:-}
if [ -n "$ca_path" ]; then
  ssl='?sslmode=verify-full&sslrootcert='
elif [ "${DB_SSL:-}" = 'true' ]; then
  ssl='?sslmode=require'
else
  ssl=''
fi

# outOfOrder: PRs merge out of timestamp order. async: Aurora DSQL has no synchronous CREATE INDEX.
add_flags() {
  set -- \
    "-locations=filesystem:$1" \
    -schemas=branch \
    -defaultSchema=branch \
    -createSchemas=true \
    -outOfOrder=true \
    "-baselineOnMigrate=$BASELINE_ON_MIGRATE" \
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
  # Docker Desktop ignores --network=host unless enabled; host-gateway reaches the host either way.
  case "$db_host" in
    localhost | 127.0.0.1 | ::1) db_host=host.docker.internal ;;
  esac
  # shellcheck disable=SC2046
  set -- docker run --rm --network=host \
    --add-host=host.docker.internal:host-gateway \
    --volume="$DB_DIR/migrations:/db/migrations:ro" \
    --env=FLYWAY_URL --env=FLYWAY_USER --env=FLYWAY_PASSWORD \
    ${ca_mount:+"$ca_mount"} "$FLYWAY_IMAGE" \
    $(add_flags /db/migrations) "$@"
fi

# Credentials via environment, never argv: `docker run` args are world-visible.
FLYWAY_URL="jdbc:postgresql://${db_host}:${db_port}/${db_name}${ssl}"
FLYWAY_USER=$db_user
FLYWAY_PASSWORD=$db_password
export FLYWAY_URL FLYWAY_USER FLYWAY_PASSWORD

exec "$@"
