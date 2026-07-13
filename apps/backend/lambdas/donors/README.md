# donors

## Description

Lambda for managing donors.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /donors |  |
| POST | /donations |  |
| POST | /donors |  |

## Setup

```bash
cd apps/backend/lambdas/donors
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/donors`.

Swagger UI: `http://localhost:3000/donors/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route donors GET /donors/{id}
node tools/lambda-cli.js add-route donors POST /donors --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
