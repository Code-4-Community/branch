# Lambda CLI Tool

A command-line tool to quickly scaffold AWS Lambda handlers with automatic Swagger documentation and local development server.

## Installation

The CLI tool is located at `apps/backend/lambdas/tools/lambda-cli.js`. Run it from the lambdas directory:

```bash
cd apps/backend/lambdas
node tools/lambda-cli.js --help
```

## Commands

### 1. Create a New Handler

```bash
node tools/lambda-cli.js init-handler <name>
```

**Example:**
```bash
node tools/lambda-cli.js init-handler users
```

This creates a new handler directory with:
- `handler.ts` - Main Lambda function
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `openapi.yaml` - Swagger/OpenAPI specification
- `swagger-utils.ts` - Swagger utilities (dev only)
- `dev-server.ts` - Local development server

### 2. Add Routes to Handler

```bash
node tools/lambda-cli.js add-route <handler> <METHOD> <path> [options]
```

**Basic Examples:**
```bash
# Simple GET route
node tools/lambda-cli.js add-route users GET /users

# Route with path parameter
node tools/lambda-cli.js add-route users GET /users/{id}

# POST route with request body
node tools/lambda-cli.js add-route users POST /users --body name:string,email:string

# Custom status code
node tools/lambda-cli.js add-route users POST /users --body name:string --status 201
```

**Advanced Examples:**
```bash
# Route with query parameters
node tools/lambda-cli.js add-route users GET /users --query page:number,limit:number,search:string

# Route with headers
node tools/lambda-cli.js add-route users GET /users/{id} --headers authorization:string

# Complex route with all options
node tools/lambda-cli.js add-route users PUT /users/{id} \
  --body name:string,email:string,age:number \
  --headers authorization:string,x-api-key:string \
  --query validate:boolean \
  --status 200
```

## Options Reference

### Route Options

| Option | Description | Example |
|--------|-------------|---------|
| `--body` | Request body fields | `--body name:string,age:number` |
| `--query` | Query parameters | `--query page:number,limit:number` |
| `--headers` | Header parameters | `--headers authorization:string` |
| `--status` | Response status code | `--status 201` |

### Supported Data Types

- `string` - Text values
- `number` - Numeric values
- `boolean` - True/false values
- `integer` - Integer values
- `array` - Array values

## Development Workflow

### 1. Create and Setup Handler

```bash
# Create new handler
node tools/lambda-cli.js init-handler products

# Navigate to handler directory
cd products

# Install dependencies
npm install

# Start development server
npm run dev
```

### 2. Add Routes

```bash
# Add some routes (run from lambdas directory)
cd ..
node tools/lambda-cli.js add-route products GET /products
node tools/lambda-cli.js add-route products GET /products/{id}
node tools/lambda-cli.js add-route products POST /products --body name:string,price:number
node tools/lambda-cli.js add-route products PUT /products/{id} --body name:string,price:number
node tools/lambda-cli.js add-route products DELETE /products/{id}
```

### 3. Access Your API

- **Handler Endpoint**: `http://localhost:3000/products`
- **Swagger UI**: `http://localhost:3000/products/swagger`
- **Health Check**: `http://localhost:3000/products/health`
- **OpenAPI Spec**: `http://localhost:3000/products/swagger.json`


## Multi-Handler Development

The dev server supports running multiple handlers simultaneously:

```bash
# Terminal 1: Start first handler
cd users && npm run dev

# Terminal 2: Start second handler
cd ../products && npm run dev

# Both handlers are now available:
# http://localhost:3000/users
# http://localhost:3000/products
# http://localhost:3000/ (shows all handlers)
```

## Adding Custom Business Logic

After generating routes, add your business logic in the `TODO` sections:

```typescript
// GET /users/{id}
if (normalizedPath.startsWith('/users/') && normalizedPath.split('/').length === 3 && method === 'GET') {
  const id = normalizedPath.split('/')[2];
  if (!id) return json(400, { message: 'id is required' });

  // TODO: Add your business logic here
  // Example:
  const user = await getUserById(id);
  if (!user) {
    return json(404, { message: 'User not found' });
  }

  return json(200, { user });
}
```
