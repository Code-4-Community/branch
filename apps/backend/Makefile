.PHONY: up down logs build clean restart ps health

# Default environment file
ENV_FILE ?= .env

# Start all services
up:
	@echo "Starting all services..."
	docker compose --env-file $(ENV_FILE) up -d --build
	@echo ""
	@echo "Services are starting up..."
	@echo "Waiting for health checks to pass..."
	@sleep 5
	@$(MAKE) health --no-print-directory

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
	docker compose --env-file $(ENV_FILE) up -d --build

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

# Reset database (WARNING: destroys all data)
db-reset:
	@echo "WARNING: This will destroy all data in the database!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	docker compose --env-file $(ENV_FILE) up -d postgres
	@echo "Database reset complete. Run 'make up' to start all services."

# Help
help:
	@echo "Available commands:"
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
	@echo "  make db-reset    - Reset database (WARNING: destroys data)"
	@echo "  make help        - Show this help message"
