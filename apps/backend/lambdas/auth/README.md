# auth

## Description

Lambda for auth handler.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /auth/health | Health check |
| POST | /auth/register |  |
| POST | /auth/login |  |
| POST | /auth/respond-challenge |  |
| POST | /auth/refresh |  |
| GET | /auth/me |  |
| POST | /auth/verify-email |  |
| POST | /auth/resend-code |  |
| POST | /auth/logout |  |
| POST | /auth/forgot-password |  |
| POST | /auth/reset-password |  |
| POST | /register |  |
| POST | /login |  |
| POST | /respond-challenge |  |
| POST | /refresh |  |
| GET | /me |  |
| POST | /verify-email |  |
| POST | /resend-code |  |
| POST | /logout |  |
| POST | /forgot-password |  |
| POST | /reset-password |  |

## Setup

```bash
cd apps/backend/lambdas/auth
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/auth`.

Swagger UI: `http://localhost:3000/auth/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route auth GET /auth/{id}
node tools/lambda-cli.js add-route auth POST /auth --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
