# projects

## Description

Lambda for managing projects.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /dashboard |  |
| GET | /projects/{id}/members |  |
| GET | /projects |  |
| GET | /projects/{id}/donors |  |
| GET | /projects/{id} |  |
| PUT | /projects/{id} |  |
| DELETE | /projects/{id} |  |
| POST | /projects |  |
| GET | /projects/{id}/expenditures |  |

## Setup

```bash
cd apps/backend/lambdas/projects
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/projects`.

Swagger UI: `http://localhost:3000/projects/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route projects GET /projects/{id}
node tools/lambda-cli.js add-route projects POST /projects --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
