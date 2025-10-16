# Users Lambda

This Lambda function provides user management functionality.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Apply database migration (if needed):
```bash
sqlite3 ../../../../db.sqlite < migration.sql
```

## Development

Start the development server:
```bash
npm run dev
```

The server will be available at:
- Handler: http://localhost:3000/users
- Swagger UI: http://localhost:3000/users/swagger
- Health Check: http://localhost:3000/users/health

## Testing

Run tests:
```bash
npm test
```

## API Endpoints

### PATCH /users/{userId}

Updates user information (partial update supported).

**Request Body:**
```json
{
  "name": "string (optional)",
  "isAdmin": "boolean (optional)"
}
```

**Success Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Updated Name",
  "isAdmin": false
}
```

**Error Responses:**
- 400: Invalid request (invalid ID format, invalid field types, or no fields provided)
- 404: User not found

**Example:**
```bash
curl -X PATCH http://localhost:3000/users/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "isAdmin": true}'
```

## Building

Build for production:
```bash
npm run build
```

Package as Lambda:
```bash
npm run package
```

## Database Schema

The `user` table has the following columns:
- `id` (INTEGER, PRIMARY KEY, AUTO INCREMENT)
- `email` (VARCHAR, NOT NULL)
- `password` (VARCHAR, NOT NULL)
- `name` (VARCHAR, nullable)
- `isAdmin` (INTEGER, default 0, where 1 = true, 0 = false)
