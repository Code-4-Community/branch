# Backend Services

This directory contains the backend Lambda services for the Branch platform, containerized with Docker for local development.

## Architecture

The backend consists of microservices, each running as a separate container:

| Service      | Port | Description                    |
| ------------ | ---- | ------------------------------ |
| PostgreSQL   | 5432 | Database with schema auto-init |
| Users        | 3001 | User management service        |
| Projects     | 3002 | Project management service     |
| Donors       | 3003 | Donor management service       |
| Expenditures | 3004 | Expenditure tracking service   |
| Reports      | 3005 | Reporting service              |
| Auth         | 3006 | Authentication service         |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- [Make](https://www.gnu.org/software/make/) (usually pre-installed on macOS/Linux)

## Quick Start

1. **Clone and navigate to the backend directory:**

   ```bash
   cd apps/backend
   ```

2. **Copy the environment file (optional, defaults work out of the box):**

   ```bash
   cp .env.example .env
   ```

3. **Start all services:**

   ```bash
   make up
   ```

4. **Verify services are running:**
   ```bash
   make health
   ```

## Available Commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `make up`                         | Start all services (builds if needed)                  |
| `make down`                       | Stop all services                                      |
| `make down-v`                     | Stop all services and remove volumes (resets database) |
| `make logs`                       | View logs for all services                             |
| `make logs-service SERVICE=users` | View logs for a specific service                       |
| `make build`                      | Build all images without starting                      |
| `make restart`                    | Rebuild and restart all services                       |
| `make ps`                         | List running containers                                |
| `make health`                     | Check health of all services                           |
| `make clean`                      | Clean up Docker resources                              |
| `make db-shell`                   | Open PostgreSQL shell                                  |
| `make db-reset`                   | Reset database (destroys all data)                     |
| `make help`                       | Show all available commands                            |

## Environment Variables

Configure services via `.env` file or environment variables:

| Variable      | Default                           | Description        |
| ------------- | --------------------------------- | ------------------ |
| `DB_HOST`     | `postgres`                        | Database host      |
| `DB_PORT`     | `5432`                            | Database port      |
| `DB_USER`     | `branch_dev`                      | Database user      |
| `DB_PASSWORD` | `password`                        | Database password  |
| `DB_NAME`     | `branch_db`                       | Database name      |
| `JWT_SECRET`  | `dev-secret-change-in-production` | JWT signing secret |

### Accessing the Database

```bash
# Open PostgreSQL shell
make db-shell

# Run a query
docker compose exec postgres psql -U branch_dev -d branch_db -c "SELECT * FROM branch.users;"
```

### Resetting the Database

```bash
make db-reset
```

## Development Workflow

### Making Changes to a Service

1. Edit the source files in `lambdas/<service>/`
2. Rebuild and restart the service:
   ```bash
   docker compose up -d --build <service>
   ```

### Viewing Service Logs

```bash
# All services
make logs

# Specific service
make logs-service SERVICE=users
```

### Testing Endpoints

```bash
# Health check
curl http://localhost:3001/users/health

# Get all users
curl http://localhost:3001/users

# Create a user
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User", "isAdmin": false}'
```

## Troubleshooting

### Services not starting

1. Check if ports are already in use:

   ```bash
   lsof -i :3001
   ```

2. View service logs:

   ```bash
   make logs-service SERVICE=users
   ```

3. Rebuild images:
   ```bash
   make restart
   ```

### Database connection errors

1. Ensure PostgreSQL is healthy:

   ```bash
   docker compose ps postgres
   ```

2. Check PostgreSQL logs:

   ```bash
   docker compose logs postgres
   ```

3. Reset the database:
   ```bash
   make db-reset
   make up
   ```

### Cleaning up

```bash
# Remove all containers, volumes, and images
make clean
```

## Project Structure

```
apps/backend/
├── docker-compose.yml    # Docker Compose configuration
├── Makefile              # Make commands for common operations
├── .env                  # Environment variables
├── .env.example          # Example environment file
├── README.md             # This file
├── db/
│   └── db_setup.sql      # Database schema and seed data
└── lambdas/
    ├── auth/             # Authentication service
    ├── donors/           # Donors service
    ├── expenditures/     # Expenditures service
    ├── projects/         # Projects service
    ├── reports/          # Reports service
    └── users/            # Users service
```

Each lambda service directory contains:

- `handler.ts` - Main Lambda handler
- `dev-server.ts` - Local development server
- `Dockerfile` - Container configuration
- `package.json` - Dependencies
- `openapi.yaml` - API specification
- `swagger-utils.ts` - Swagger UI utilities


## Deployment to AWS

Lambda functions are automatically built and deployed to AWS when changes are pushed to the `main` branch.

### Lambda Deploy Workflow

The GitHub Actions workflow (`.github/workflows/lambda-deploy.yml`) handles the entire deployment pipeline:

1. **Change Detection** — Identifies which Lambda functions changed in the push
2. **Build** — Runs `npm ci` and `npm run package` in parallel for each changed Lambda to produce `lambda.zip`
3. **Deploy** — Updates AWS Lambda functions using the AWS CLI with naming convention `branch-{service-name}`
4. **Summary** — Reports overall deployment status and blocks merges if deployment fails

### Deployment Requirements

- AWS credentials are configured in repository secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- Lambda function names in AWS must follow the pattern: `branch-{service-name}`
  - Example: `branch-auth`, `branch-users`, `branch-donors`
- Each Lambda directory must have a `npm run package` script that produces `lambda.zip`
- The `Deployment Summary` status check must pass in GitHub before merges are allowed

### Triggering Deployment

Simply push changes to the `main` branch in any Lambda directory:

```bash
git push origin main
```

The workflow will automatically detect the changed Lambdas, build them, and deploy them to AWS in parallel.

### Deployment Status

Monitor deployment progress in the GitHub Actions tab:

```
https://github.com/{owner}/branch/actions
```

Each deployment job produces:
- Build artifacts (Lambda packages)
- Deployment logs with status
- Failures are reported and block PR merges

### Manual Deployment (if needed)

To manually update a Lambda function in AWS:

```bash
# Build the Lambda package
cd apps/backend/lambdas/{service-name}
npm run package

# Deploy using AWS CLI
aws lambda update-function-code \
  --function-name branch-{service-name} \
  --zip-file fileb://lambda.zip \
  --region us-east-2
```

**Note:** The automated workflow is the recommended approach. Manual deployment should only be used as a fallback when the CI/CD pipeline is unavailable. Always ensure your changes are reflected in git history before deploying.

### Post-Deployment Verification

After deployment, verify the Lambda function is running correctly by checking CloudWatch logs and testing endpoints with the live environment. Monitor error rates and latency to ensure the update didn't introduce regressions.
