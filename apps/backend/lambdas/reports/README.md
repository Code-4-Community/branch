# reports

## Description

TODO: Add a description of the reports lambda.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /reports |  |

## Setup

```bash
cd apps/backend/lambdas/reports
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/reports`.

Swagger UI: `http://localhost:3000/reports/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route reports GET /reports/{id}
node tools/lambda-cli.js add-route reports POST /reports --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
