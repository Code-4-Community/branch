# users

## Description

Lambda for managing users.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /users/health | Health check |
| GET | /users |  |
| GET | /users/{userId} |  |
| GET | /users/{userId}/photo-upload-url |  |
| PATCH | /users/{userId} |  |
| DELETE | /users/{userId} |  |
| POST | /users |  |

## Setup

```bash
cd apps/backend/lambdas/users
npm install
npm run dev
```

The handler will be available at `http://localhost:3000/users`.

Swagger UI: `http://localhost:3000/users/swagger`

## Adding Routes

From the `apps/backend/lambdas` directory:

```bash
node tools/lambda-cli.js add-route users GET /users/{id}
node tools/lambda-cli.js add-route users POST /users --body name:string
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run package` | Build and zip for deployment |
