#!/bin/sh
set -eu

FLYWAY_IMAGE=flyway/flyway:13.5.0-alpine
# Not bundled in the CLI. Built for Flyway 10.x; loads under 13.5. Also pinned in Dockerfile.
DSQL_PLUGIN_URL=https://repo1.maven.org/maven2/org/flywaydb/flyway-database-dsql/10.26.0/flyway-database-dsql-10.26.0.jar
DSQL_PLUGIN_SHA256=2d5b8e3f16732afc70e6bd096c4817f8967f7e755c4e38d5f604ca85cfacdc89
DB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Last migration applied under kysely; already on production, so Flyway baselines here.
# Also a permanent floor: anything at or below it is "Below Baseline" and never runs.
# Set to 0 once production is on DSQL, which runs every file from scratch.
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

case "$db_host" in
  *.dsql.*.on.aws) dsql=true ;;
  *) dsql=false ;;
esac

ca_path=${DB_SSL_CA:-}
if [ "$dsql" = true ]; then
  # IAM token instead of a password; TLS verified against the JVM's Amazon roots.
  ca_path=''
  ssl='?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory'
  if [ -z "${DATABASE_URL:-}" ]; then
    db_user=${DB_USER:-admin}
    db_name=${DB_NAME:-postgres}
    db_password=${DB_PASSWORD:-}
  fi
  if [ -z "$db_password" ]; then
    region=${db_host#*.dsql.}
    region=${region%.on.aws}
    if [ "$db_user" = admin ]; then
      token_cmd=generate-db-connect-admin-auth-token
    else
      token_cmd=generate-db-connect-auth-token
    fi
    db_password=$(aws dsql "$token_cmd" --hostname "$db_host" --region "$region" --expires-in 3600)
  fi
  : "${FLYWAY_PLACEHOLDER_ASYNC:=ASYNC}"
elif [ -n "$ca_path" ]; then
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

if [ "$dsql" = false ] && command -v flyway >/dev/null 2>&1; then
  [ -z "$ca_path" ] || ssl="${ssl}${ca_path}"
  # shellcheck disable=SC2046  # deliberate word splitting: one flag per line
  set -- flyway $(add_flags "$DB_DIR/migrations") "$@"
else
  ca_mount=''
  plugin_mount=''
  if [ "$dsql" = true ]; then
    cache=${XDG_CACHE_HOME:-$HOME/.cache}/branch-flyway
    plugin=$cache/flyway-database-dsql-$DSQL_PLUGIN_SHA256.jar
    if [ ! -f "$plugin" ]; then
      mkdir -p "$cache"
      curl -fsSL -o "$plugin.tmp" "$DSQL_PLUGIN_URL"
      actual=$(openssl dgst -sha256 -r "$plugin.tmp" | cut -d' ' -f1)
      if [ "$actual" != "$DSQL_PLUGIN_SHA256" ]; then
        rm -f "$plugin.tmp"
        echo "flyway.sh: flyway-database-dsql checksum mismatch ($actual)" >&2
        exit 1
      fi
      mv "$plugin.tmp" "$plugin"
    fi
    plugin_mount="--volume=$plugin:/flyway/drivers/flyway-database-dsql.jar:ro"
  fi
  if [ -n "$ca_path" ]; then
    ssl="${ssl}/rds-ca.pem"
    ca_mount="--volume=$ca_path:/rds-ca.pem:ro"
  fi
  # Docker Desktop ignores --network=host unless it is switched on, so a loopback
  # host has to go via the gateway. Only there: on a native daemon --network=host
  # is real, and the gateway address misses a server bound to loopback only.
  if docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi 'docker desktop'; then
    case "$db_host" in
      localhost | 127.0.0.1 | ::1) db_host=host.docker.internal ;;
    esac
  fi
  # shellcheck disable=SC2046
  set -- docker run --rm --network=host \
    --add-host=host.docker.internal:host-gateway \
    --volume="$DB_DIR/migrations:/db/migrations:ro" \
    --env=FLYWAY_URL --env=FLYWAY_USER --env=FLYWAY_PASSWORD \
    --env=FLYWAY_DSQL_AWAIT_ASYNC_INDEXES --env=FLYWAY_DSQL_OCC_MAX_RETRIES \
    ${ca_mount:+"$ca_mount"} ${plugin_mount:+"$plugin_mount"} "$FLYWAY_IMAGE" \
    $(add_flags /db/migrations) "$@"
fi

# Credentials via environment, never argv: `docker run` args are world-visible.
FLYWAY_URL="jdbc:postgresql://${db_host}:${db_port}/${db_name}${ssl}"
FLYWAY_USER=$db_user
FLYWAY_PASSWORD=$db_password
export FLYWAY_URL FLYWAY_USER FLYWAY_PASSWORD

# Read by flyway-database-dsql; awaiting keeps migrations off still-building indexes.
FLYWAY_DSQL_AWAIT_ASYNC_INDEXES=${FLYWAY_DSQL_AWAIT_ASYNC_INDEXES:-true}
FLYWAY_DSQL_OCC_MAX_RETRIES=${FLYWAY_DSQL_OCC_MAX_RETRIES:-3}
export FLYWAY_DSQL_AWAIT_ASYNC_INDEXES FLYWAY_DSQL_OCC_MAX_RETRIES

exec "$@"
