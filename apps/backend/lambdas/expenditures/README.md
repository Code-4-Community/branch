# expenditures

## Description

Lambda for tracking project expenditures.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /expenditures |  |
| POST | /expenditures |  |
| GET | /expenditures/{id} |  |
| DELETE | /expenditures/{id} |  |

## Setup

```bash
cd apps/backend/lambdas/expenditures
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/expenditures`.

Swagger UI: `http://localhost:3000/expenditures/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route expenditures GET /expenditures/{id}
node tools/lambda-cli.js add-route expenditures POST /expenditures --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
