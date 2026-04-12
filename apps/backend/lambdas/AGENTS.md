# Lambda CLI

When adding new API endpoints or scaffolding new Lambda handlers, use the CLI at `tools/lambda-cli.js`. Run all commands from this directory (`apps/backend/lambdas/`).

## Commands

### `init-handler <name>`
Creates a new Lambda handler with boilerplate (handler.ts, dev-server.ts, openapi.yaml, swagger-utils.ts, package.json, tsconfig.json, README.md, test/).

```bash
node tools/lambda-cli.js init-handler orders
```

### `add-route <handler> <METHOD> <path> [options]`
Adds a route stub to both `handler.ts` (between the ROUTES-START/ROUTES-END markers) and `openapi.yaml`.

Options:
- `--body field:type,field:type` — request body fields
- `--query field:type,field:type` — query parameters
- `--headers field:type,field:type` — header parameters
- `--status <code>` — response status code (default: 200)

```bash
node tools/lambda-cli.js add-route auth POST /reset-password --body email:string,code:string,newPassword:string
node tools/lambda-cli.js add-route users GET /users/{id}
node tools/lambda-cli.js add-route users GET /users --query page:number,limit:number
node tools/lambda-cli.js add-route users POST /users --body name:string --headers authorization:string --status 201
```

### `list-routes <handler>`
Lists all routes defined in a handler (from both handler.ts and openapi.yaml).

```bash
node tools/lambda-cli.js list-routes auth
```

### `generate-readme [handler]`
Generates/regenerates README.md for a handler. Omit handler name to regenerate all.

```bash
node tools/lambda-cli.js generate-readme auth
node tools/lambda-cli.js generate-readme
```

## After using add-route

The CLI generates stub code with `// TODO: Add your business logic here`. You must:
1. Replace the TODO stub with actual implementation
2. Update the generated OpenAPI spec in `openapi.yaml` with proper request/response schemas, descriptions, and status codes
