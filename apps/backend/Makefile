.PHONY: up down logs build clean restart ps health migrate show-migrations new-migration seed types db-reset

# Default environment file
ENV_FILE ?= .env

# Run container commands that write into the repo as the invoking user, so
# generated files aren't left root-owned. npm needs a writable cache to match.
DOCKER_USER = --user "$(shell id -u):$(shell id -g)" -e npm_config_cache=/tmp/.npm -e HOME=/tmp

# Start all services (foreground, Ctrl+C stops everything).
#
# --abort-on-container-failure, not --abort-on-container-exit: the `migrator`
# service is one-shot and exits 0 as soon as migrations are applied, which
# --abort-on-container-exit would treat as a reason to tear down the whole stack.
up:
	@echo "Starting all services..."
	docker compose --env-file $(ENV_FILE) up --build --abort-on-container-failure

# Stop all services
down:
	@echo "Stopping all services..."
	docker compose down

# Stop all services and remove volumes
down-v:
	@echo "Stopping all services and removing volumes..."
	docker compose down -v

# View logs for all services
logs:
	docker compose logs -f

# View logs for a specific service (usage: make logs-service SERVICE=users)
logs-service:
	docker compose logs -f $(SERVICE)

# Build all images without starting
build:
	docker compose build

# Rebuild and restart all services
restart:
	@echo "Restarting all services..."
	docker compose down
	docker compose --env-file $(ENV_FILE) up -d --build --abort-on-container-failure

# List running containers
ps:
	docker compose ps

# Health check all services
health:
	@echo "Checking service health..."
	@echo ""
	@echo "PostgreSQL:"
	@curl -s http://localhost:5432 2>/dev/null && echo "  ✓ Running" || echo "  ✓ Running (port check only)"
	@echo ""
	@echo "Users Service (port 3001):"
	@curl -s http://localhost:3001/users/health | jq . 2>/dev/null || echo "  ⏳ Starting..."
	@echo ""
	@echo "Projects Service (port 3002):"
	@curl -s http://localhost:3002/projects/health | jq . 2>/dev/null || echo "  ⏳ Starting..."
	@echo ""
	@echo "Donors Service (port 3003):"
	@curl -s http://localhost:3003/donors/health | jq . 2>/dev/null || echo "  ⏳ Starting..."
	@echo ""
	@echo "Expenditures Service (port 3004):"
	@curl -s http://localhost:3004/expenditures/health | jq . 2>/dev/null || echo "  ⏳ Starting..."
	@echo ""
	@echo "Reports Service (port 3005):"
	@curl -s http://localhost:3005/reports/health | jq . 2>/dev/null || echo "  ⏳ Starting..."
	@echo ""
	@echo "Auth Service (port 3006):"
	@curl -s http://localhost:3006/auth/health | jq . 2>/dev/null || echo "  ⏳ Starting..."

# Clean up Docker resources
clean:
	@echo "Cleaning up Docker resources..."
	docker compose down -v --rmi local
	docker system prune -f

# Database shell
db-shell:
	docker compose exec postgres psql -U branch_dev -d branch_db

# Promote a locally-registered user to admin. LOCAL DEV ONLY.
# There is deliberately no API for this: branch.users.is_admin can only be set by
# an existing admin (PATCH /users/{userId}), so the first admin in any fresh
# environment has to be bootstrapped in SQL. The same chicken-and-egg exists in
# production -- see apps/backend/AGENTS.md.
# usage: make grant-admin EMAIL=you@example.com
grant-admin:
	@test -n "$(EMAIL)" || (echo "usage: make grant-admin EMAIL=you@example.com" && exit 1)
	docker compose exec -T postgres psql -U branch_dev -d branch_db \
	  -c "UPDATE branch.users SET is_admin = TRUE WHERE email = lower('$(EMAIL)');"

# ---------------------------------------------------------------------------
# Migrations. Schema changes live in db/migrations/*.sql and are applied to
# production automatically on merge -- see apps/backend/db/README.md.
# ---------------------------------------------------------------------------

# Apply pending migrations, seed if the database is empty, regenerate the shared
# DB types, then show what's applied.
#
# THE command to run after adding or pulling a migration. Safe any time: with
# nothing pending it just prints status. Regenerating types is folded in here on
# purpose, so it cannot be forgotten.
migrate:
	@docker compose --env-file $(ENV_FILE) build migrator
	@docker compose --env-file $(ENV_FILE) run --rm migrator npm run migrate
	@docker compose --env-file $(ENV_FILE) run --rm migrator npm run seed -- --if-empty
	@$(MAKE) types
	@$(MAKE) show-migrations
	@echo ""
	@echo "Commit db/migrations/*.sql together with shared/types/db-types.d.ts."

# List every migration and whether it has been applied. Read-only.
#
# The source of truth is the branch.kysely_migration table -- one row per applied
# migration -- diffed against the .sql files in db/migrations.
show-migrations:
	@docker compose --env-file $(ENV_FILE) run --rm migrator npm run migrate:status

# Create an empty timestamped migration file, then say what to do next.
# usage: make new-migration NAME=add_expenditure_project_id_index
#
# Runs in the container (so Docker is the only prerequisite) with db/migrations
# bind-mounted, so the new file lands in the repo. DOCKER_USER keeps it owned by
# you rather than root.
new-migration:
	@test -n "$(NAME)" || (echo "usage: make new-migration NAME=add_expenditure_index" && exit 1)
	@docker compose --env-file $(ENV_FILE) run --rm --no-deps $(DOCKER_USER) \
	  -v "$(CURDIR)/db/migrations:/db/migrations" \
	  migrator npm run --silent migrate:new -- $(NAME)
	@echo ""
	@echo "Now edit the file above, then run 'make migrate'."

# Truncate every table and re-apply db/seed.sql. Leaves the schema alone.
seed:
	@docker compose --env-file $(ENV_FILE) run --rm migrator npm run seed

# Regenerate shared/types/db-types.d.ts from the local database. Called for you by
# `make migrate`.
#
# Runs in the container on purpose: on the host, localhost:5432 may resolve to a
# separate postgres install (homebrew, Postgres.app) instead of the compose one,
# and you would silently generate types from the wrong database. Inside the
# container DB_HOST=postgres is unambiguous.
types:
	@docker compose --env-file $(ENV_FILE) run --rm $(DOCKER_USER) \
	  -v "$(CURDIR)/../../shared/types:/shared/types" \
	  -e TYPES_OUT=/shared/types/db-types.d.ts \
	  migrator npm run --silent types

# Rebuild schema "branch" from the migration files and reseed, in place.
# Use `make down-v` if you need to destroy the volume itself.
db-reset:
	@echo "WARNING: this drops and rebuilds schema \"branch\" -- all local data is lost!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@docker compose --env-file $(ENV_FILE) build migrator
	@docker compose --env-file $(ENV_FILE) run --rm migrator npm run reset
	@$(MAKE) types
	@echo "Schema rebuilt from db/migrations and reseeded."

# Help
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Migrations (see apps/backend/db/README.md):"
	@echo "  make migrate                  - Apply pending migrations, seed if empty, regenerate types"
	@echo "  make show-migrations          - Show which migrations are applied and which are pending"
	@echo "  make new-migration NAME=<x>   - Create a new empty migration file"
	@echo "  make seed                     - Truncate every table and re-apply db/seed.sql"
	@echo "  make types                    - Regenerate shared/types/db-types.d.ts"
	@echo "  make db-reset                 - Rebuild schema from migrations + reseed (destroys data)"
	@echo ""
	@echo "  Services:"
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make down-v      - Stop all services and remove volumes"
	@echo "  make logs        - View logs for all services"
	@echo "  make logs-service SERVICE=<name> - View logs for a specific service"
	@echo "  make build       - Build all images"
	@echo "  make restart     - Rebuild and restart all services"
	@echo "  make ps          - List running containers"
	@echo "  make health      - Check health of all services"
	@echo "  make clean       - Clean up Docker resources"
	@echo "  make db-shell    - Open PostgreSQL shell"
	@echo "  make grant-admin EMAIL=<email> - Promote a local user to admin"
	@echo "  make help        - Show this help message"
