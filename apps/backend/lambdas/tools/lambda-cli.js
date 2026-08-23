#!/usr/bin/env node

// Simple CLI to scaffold Lambda handlers and add routes
// Usage examples:
//   node tools/lambda-cli.js init-handler orders
//   node tools/lambda-cli.js add-route users/add POST /user/create --body name:string,email:string

const fs = require('fs');
const path = require('path');

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function error(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFileIfAbsent(target, content) {
  if (fs.existsSync(target)) return false;
  fs.writeFileSync(target, content, 'utf8');
  return true;
}

function overwriteFile(target, content) {
  fs.writeFileSync(target, content, 'utf8');
}


// Templates
function templatePackageJson() {
  return `{
  "name": "lambda-local",
  "version": "1.0.0",
  "private": true,
  "main": "handler.ts",
  "scripts": {
    "dev": "ts-node --transpile-only dev-server.ts",
    "build": "tsc",
    "test": "jest",
    "package": "npm run build && cd dist && zip -r ../lambda.zip . -x '*.map' 'dev-server.*' 'swagger-utils.*'"
  },
  "devDependencies": {
    "@branch/types": "file:../../../../shared/types",
    "@types/aws-lambda": "^8.10.131",
    "@types/node": "^20.11.30",
    "@types/pg": "^8.15.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5",
    "js-yaml": "^4.1.0",
    "start-server-and-test": "^2.1.1"
  },
  "dependencies": {
    "@branch/lambda-auth": "file:../../../../shared/lambda-auth",
    "@branch/lambda-http": "file:../../../../shared/lambda-http",
    "dotenv": "^16.4.7",
    "jest":"^30.2.0",
    "kysely": "^0.28.8",
    "pg": "^8.16.3"
  }
}
`;
}

function templateTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["*.ts", "controllers/**/*.ts"],
  "exclude": ["node_modules", "dist", "dev-server.ts", "swagger-utils.ts"]
}
`;
}

function templateOpenApiYaml(title) {
  return `openapi: 3.0.3
info:
  title: ${title} (Local)
  version: 1.0.0
servers:
  - url: http://localhost:3000
paths:
  /${title}/health:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
`;
}

function templateSwaggerUtils() {
  return `import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export function loadOpenApiSpec(): unknown {
  const yamlPath = path.join(__dirname, 'openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    const file = fs.readFileSync(yamlPath, 'utf8');
    return yaml.load(file);
  }
  return { openapi: '3.0.0', info: { title: 'Local API', version: '1.0.0' }, paths: {} };
}

export function getSwaggerHtml(specUrl: string): string {
  return \`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({url: '\${specUrl}', dom_id: '#swagger-ui'});
    </script>
  </body>
</html>\`;
}
`;
}

function templateReadme(handlerName, routes, options = {}) {
  if (!routes) {
    routes = [{ method: 'GET', path: '/health', description: 'Health check' }];
  }

  const description = options.description || `TODO: Add a description of the ${handlerName} lambda.`;

  const endpointRows = routes
    .map((r) => `| ${r.method} | ${r.path} | ${r.description || ''} |`)
    .join('\n');

  const customSections = options.customSections ? `\n${options.customSections}\n` : '';

  return `# ${handlerName}

## Description

${description}

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
${endpointRows}

## Setup

\`\`\`bash
cd apps/backend/lambdas/${handlerName}
npm install
npm run dev
\`\`\`

The handler will be available at \`http://localhost:3000/${handlerName}\`.

Swagger UI: \`http://localhost:3000/${handlerName}/swagger\`

## Adding Routes

From the \`apps/backend/lambdas\` directory:

\`\`\`bash
node tools/lambda-cli.js add-route ${handlerName} GET /${handlerName}/{id}
node tools/lambda-cli.js add-route ${handlerName} POST /${handlerName} --body name:string
\`\`\`

## Scripts

| Script | Description |
|--------|-------------|
| \`npm run dev\` | Start local development server |
| \`npm run build\` | Compile TypeScript |
| \`npm test\` | Run tests |
| \`npm run package\` | Build and zip for deployment |
${customSections}`;
}

function templateDbTs() {
  return `import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '@branch/types';

const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? 'branch_dev',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'branch_db',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    }),
  }),
});

export default db;
`;
}

function templateAuthTs() {
  return `import { authenticateRequest as _authenticateRequest } from '@branch/lambda-auth';
import db from './db';

export * from '@branch/lambda-auth';

export async function authenticateRequest(
  event: any,
): Promise<import('@branch/lambda-auth').AuthContext> {
  return _authenticateRequest(db, event);
}
`;
}

function templateJestSetup(handlerName) {
  return `
test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/${handlerName}/health")
  expect(res.status).toBe(200);
});
`}

function templateDevServer(handlerName) {
  return `import { config } from 'dotenv';
config(); // Load .env file

import { handler } from './handler';
import { loadOpenApiSpec, getSwaggerHtml } from './swagger-utils';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { APIGatewayProxyEvent } from 'aws-lambda';

const HANDLER_NAME = '${handlerName}';
const BASE_PATH = \`/\${HANDLER_NAME}\`;

// Check if shared server exists, if not create it
const SHARED_SERVER_PORT = 3000;
const LOCK_FILE = path.join(__dirname, '..', '.dev-server.lock');

async function startOrJoinServer() {
  // Try to register this handler with existing server
  try {
    const response = await fetch(\`http://localhost:\${SHARED_SERVER_PORT}/_register\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handlerName: HANDLER_NAME,
        handlerPath: __dirname
      })
    });

    if (response.ok) {
      console.log(\`Registered \${HANDLER_NAME} with existing dev server\`);
      console.log(\`Handler available at: http://localhost:\${SHARED_SERVER_PORT}\${BASE_PATH}\`);
      console.log(\`Swagger UI: http://localhost:\${SHARED_SERVER_PORT}\${BASE_PATH}/swagger\`);
      return;
    }
  } catch (err) {
    // Server doesn't exist, we'll create it
  }

  // Create the shared server
  const handlers = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [] as Buffer[];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const bodyRaw = Buffer.concat(chunks).toString('utf8');
        const fullUrl = new URL(req.url || '/', \`http://localhost:\${SHARED_SERVER_PORT}\`);

        // Handle registration endpoint
        if (fullUrl.pathname === '/_register' && req.method === 'POST') {
          const { handlerName, handlerPath } = JSON.parse(bodyRaw);
          try {
            const handlerModule = require(path.join(handlerPath, 'handler.ts'));
            const swaggerUtils = require(path.join(handlerPath, 'swagger-utils.ts'));
            handlers.set(handlerName, { handler: handlerModule.handler, swaggerUtils, handlerPath });
            res.statusCode = 200;
            res.end('OK');
            console.log(\`Registered handler: \${handlerName}\`);
          } catch (err) {
            res.statusCode = 500;
            res.end('Failed to load handler');
          }
          return;
        }

        // Handle root route - show available handlers
        if (fullUrl.pathname === '/' && req.method === 'GET') {
          const handlerList = Array.from(handlers.keys()).map(name =>
            \`<li><a href="/\${name}">\${name}</a> - <a href="/\${name}/swagger">Swagger UI</a></li>\`
          ).join('');

          const html = \`<!DOCTYPE html>
<html><head><title>Lambda Dev Server</title></head>
<body>
  <h1>Lambda Development Server</h1>
  <h2>Available Handlers:</h2>
  <ul>\${handlerList}</ul>
</body></html>\`;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }

        // Route to specific handler
        const pathParts = fullUrl.pathname.split('/').filter(Boolean);
        const handlerName = pathParts[0];

        if (!handlers.has(handlerName)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: \`Handler '\${handlerName}' not found\` }));
          return;
        }

        const { handler: handlerFn, swaggerUtils } = handlers.get(handlerName);
        const handlerPath = '/' + pathParts.slice(1).join('/');

        // Handle Swagger routes for this handler
        if (handlerPath === '/swagger.json' && req.method === 'GET') {
          const spec = swaggerUtils.loadOpenApiSpec();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(spec));
          return;
        }
        if (handlerPath === '/swagger' && req.method === 'GET') {
          const html = swaggerUtils.getSwaggerHtml(\`/\${handlerName}/swagger.json\`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }

                // Create Lambda event (compatible with both API Gateway and Function URL formats)
                const event = {
                  // API Gateway format
                  body: bodyRaw || null,
                  headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])) as Record<string, string>,
                  httpMethod: (req.method || 'GET').toUpperCase(),
                  isBase64Encoded: false,
                  multiValueHeaders: {},
                  multiValueQueryStringParameters: null,
                  path: handlerPath || '/',
                  pathParameters: null,
                  queryStringParameters: Object.fromEntries(fullUrl.searchParams.entries()),
                  requestContext: {
                    // Function URL format
                    http: {
                      method: (req.method || 'GET').toUpperCase(),
                      path: handlerPath || '/',
                      protocol: 'HTTP/1.1',
                      sourceIp: '127.0.0.1'
                    }
                  } as any,
                  resource: handlerPath || '/',
                  stageVariables: null,
                  // Function URL format
                  rawPath: handlerPath || '/',
                  rawQueryString: fullUrl.search.slice(1) || ''
                };

        const result = await handlerFn(event);
        res.statusCode = result.statusCode || 200;
        if (result.headers) {
          for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, String(v));
        }
        res.end(result.body);
      });
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: 'Server error' }));
    }
  });

  server.listen(SHARED_SERVER_PORT, () => {
    console.log(\`Lambda Dev Server started on http://localhost:\${SHARED_SERVER_PORT}\`);
    console.log(\`Available handlers will be listed at http://localhost:\${SHARED_SERVER_PORT}\`);

    // Register this handler
    handlers.set(HANDLER_NAME, {
      handler,
      swaggerUtils: { loadOpenApiSpec, getSwaggerHtml },
      handlerPath: __dirname
    });

    console.log(\`Handler '\${HANDLER_NAME}' available at: http://localhost:\${SHARED_SERVER_PORT}\${BASE_PATH}\`);
    console.log(\`Swagger UI: http://localhost:\${SHARED_SERVER_PORT}\${BASE_PATH}/swagger\`);
  });
}

startOrJoinServer().catch(console.error);
`;
}

function templateHandlerTsClean(name) {
  return `import { dispatch } from '@branch/lambda-http';
import { routes } from './routes';

export const handler = (event: any) => dispatch(event, { prefix: '${name}', routes });
`;
}

// Kept as an alias — both used to emit different handler.ts shapes, but
// dispatch() now owns OPTIONS/health/404/500, so there is only one shape.
function templateHandlerTs(name) {
  return templateHandlerTsClean(name);
}

function templateRoutesTs() {
  return `import type { Route } from '@branch/lambda-http';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  // <<< ROUTES-END
];
`;
}

function templateControllerFile() {
  return `import { json, type RouteHandler } from '@branch/lambda-http';
`;
}

// `/users/{id}` -> `/users/:id`
function bracesToColon(apiPath) {
  return apiPath.replace(/\{([^}]+)\}/g, ':$1');
}

// `/users/:id` -> `/users/{id}`
function colonToBraces(pattern) {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

// Prefix apiPath with the service name unless it's already there, mirroring
// dispatch()'s own canonicalization in @branch/lambda-http.
function ensurePrefixed(serviceName, apiPath) {
  let p = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const base = `/${serviceName}`;
  if (p === base || p.startsWith(`${base}/`)) return p;
  return p === '/' ? base : base + p;
}

function pathParamsOf(bracePath) {
  const params = [];
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(bracePath)) !== null) params.push(m[1]);
  return params;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toIdentifier(seg) {
  return capitalize(seg.replace(/[^a-zA-Z0-9]/g, ''));
}

const METHOD_VERBS = { GET: 'get', POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' };

// Derive a stub function name from the route, e.g. GET /users/:userId -> getUsersById.
function deriveHandlerName(method, fullPattern, serviceName, existingNames) {
  const verb = METHOD_VERBS[method.toUpperCase()] || method.toLowerCase();
  const segs = fullPattern.split('/').filter(Boolean);
  const rest = segs[0] === serviceName ? segs.slice(1) : segs;
  const hasParam = rest.some((s) => s.startsWith(':'));
  const staticSegs = rest.filter((s) => !s.startsWith(':')).map(toIdentifier);
  const base = staticSegs.join('') || toIdentifier(serviceName);
  const name = `${verb}${base}${hasParam ? 'ById' : ''}`;

  let candidate = name;
  let i = 2;
  while (existingNames.has(candidate)) candidate = `${name}${i++}`;
  return candidate;
}

// Merge `newSpecifiers` into an `import { ... } from 'moduleSpecifier';` line,
// adding the import if it doesn't exist yet.
function upsertNamedImport(source, moduleSpecifier, newSpecifiers) {
  const re = new RegExp(`import \\{([^}]*)\\} from '${moduleSpecifier}';`);
  const match = source.match(re);
  if (match) {
    const existing = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const spec of newSpecifiers) {
      if (!existing.includes(spec)) existing.push(spec);
    }
    return source.replace(match[0], `import { ${existing.join(', ')} } from '${moduleSpecifier}';`);
  }
  const importLineRe = /^import .*;\n/gm;
  let lastImportEnd = 0;
  let m;
  while ((m = importLineRe.exec(source)) !== null) lastImportEnd = m.index + m[0].length;
  const newLine = `import { ${newSpecifiers.join(', ')} } from '${moduleSpecifier}';\n`;
  return source.slice(0, lastImportEnd) + newLine + source.slice(lastImportEnd);
}

// Insert a route table entry into routes.ts (before ROUTES-END) and wire up
// the controller import; scaffolds the controller file/stub if needed.
function addRouteToRoutes(routesPath, controllersDir, serviceName, method, apiPath, options = {}) {
  const methodUpper = method.toUpperCase();
  const bracePattern = ensurePrefixed(serviceName, apiPath);
  const colonPattern = bracesToColon(bracePattern);
  const pathParams = pathParamsOf(bracePattern);

  let routesSource = fs.readFileSync(routesPath, 'utf8');
  const marker = '// <<< ROUTES-END';
  if (!routesSource.includes(marker))
    error('Marker not found in routes.ts (// <<< ROUTES-END)');

  const controllerModule = `./controllers/${serviceName}`;
  const controllerPath = path.join(controllersDir, `${serviceName}.ts`);
  ensureDir(controllersDir);
  let controllerSource = fs.existsSync(controllerPath)
    ? fs.readFileSync(controllerPath, 'utf8')
    : templateControllerFile();

  const existingNames = new Set(
    [...controllerSource.matchAll(/export const (\w+)/g)].map((m) => m[1]),
  );
  const fnName = deriveHandlerName(methodUpper, colonPattern, serviceName, existingNames);

  // Build the stub handler body.
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(methodUpper) || options.body;
  const bodyLines = [];
  if (pathParams.length > 0) bodyLines.push(`const { ${pathParams.join(', ')} } = params;`);
  if (needsBody) {
    bodyLines.push('const body = parseBody(event);');
    bodyLines.push("if (!body) return json(400, { message: 'Invalid JSON body' });");
  }
  if (options.query) bodyLines.push('const query = event.queryStringParameters || {};');
  if (options.headers) bodyLines.push('const headers = event.headers || {};');

  const statusCode = options.status || 200;
  const responseProps = ['ok: true', `route: '${methodUpper} ${colonPattern}'`];
  if (pathParams.length > 0) responseProps.push(`pathParams: { ${pathParams.join(', ')} }`);
  if (options.query) responseProps.push('query');
  if (options.headers) responseProps.push('headers');
  if (needsBody) responseProps.push('body');
  bodyLines.push('// TODO: Add your business logic here');
  bodyLines.push(`return json(${statusCode}, { ${responseProps.join(', ')} });`);

  const ctxProps = [];
  if (needsBody || options.query || options.headers) ctxProps.push('event');
  if (pathParams.length > 0) ctxProps.push('params');
  const ctxParam = ctxProps.length ? `{ ${ctxProps.join(', ')} }` : '';

  const neededImports = ['json', 'type RouteHandler'];
  if (needsBody) neededImports.push('parseBody');
  controllerSource = upsertNamedImport(controllerSource, '@branch/lambda-http', neededImports);
  controllerSource += `
export const ${fnName}: RouteHandler = async (${ctxParam}) => {
  ${bodyLines.join('\n  ')}
};
`;
  fs.writeFileSync(controllerPath, controllerSource, 'utf8');

  routesSource = upsertNamedImport(routesSource, controllerModule, [fnName]);
  const entryLine = `  { method: '${methodUpper}', pattern: '${colonPattern}', handler: ${fnName} },\n`;
  const markerIdx = routesSource.indexOf(marker);
  const lineStart = routesSource.lastIndexOf('\n', markerIdx) + 1;
  routesSource = routesSource.slice(0, lineStart) + entryLine + routesSource.slice(lineStart);
  fs.writeFileSync(routesPath, routesSource, 'utf8');

  return { bracePattern, colonPattern };
}

function addRouteToOpenApi(openapiPath, method, apiPath, options = {}) {
  // Append a properly formatted path block to the end of the file
  const methodLower = String(method || '').toLowerCase();
  const upperSummary = methodUpper(method);

  // Extract path parameters
  const pathParams = [];
  const pathParamRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = pathParamRegex.exec(apiPath)) !== null) {
    pathParams.push(match[1]);
  }

  const lines = [];
  lines.push(`  ${apiPath}:`);
  lines.push(`    ${methodLower}:`);
  lines.push(`      summary: ${upperSummary} ${apiPath}`);

  // Add parameters section
  const hasParams = pathParams.length > 0 || options.query || options.headers;
  if (hasParams) {
    lines.push(`      parameters:`);

    // Path parameters
    for (const param of pathParams) {
      lines.push(`        - in: path`);
      lines.push(`          name: ${param}`);
      lines.push(`          required: true`);
      lines.push(`          schema:`);
      lines.push(`            type: string`);
    }

    // Query parameters
    if (options.query) {
      const queryFields = options.query
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const field of queryFields) {
        const [name, type] = field.split(':').map((s) => s.trim());
        const yamlType = type || 'string';
        lines.push(`        - in: query`);
        lines.push(`          name: ${name}`);
        lines.push(`          required: false`);
        lines.push(`          schema:`);
        lines.push(`            type: ${yamlType}`);
      }
    }

    // Header parameters
    if (options.headers) {
      const headerFields = options.headers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const field of headerFields) {
        const [name, type] = field.split(':').map((s) => s.trim());
        const yamlType = type || 'string';
        lines.push(`        - in: header`);
        lines.push(`          name: ${name}`);
        lines.push(`          required: false`);
        lines.push(`          schema:`);
        lines.push(`            type: ${yamlType}`);
      }
    }
  }

  // Add request body
  const needsBody =
    ['post', 'put', 'patch'].includes(methodLower) || options.body;
  if (needsBody && options.body) {
    lines.push(`      requestBody:`);
    lines.push(`        required: true`);
    lines.push(`        content:`);
    lines.push(`          application/json:`);
    lines.push(`            schema:`);
    lines.push(`              type: object`);
    lines.push(`              properties:`);
    const fields = options.body
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const field of fields) {
      const [name, type] = field.split(':').map((s) => s.trim());
      const yamlType = type || 'string';
      lines.push(`                ${name}:`);
      lines.push(`                  type: ${yamlType}`);
    }
  }

  // Add responses
  const statusCode = options.status || 200;
  lines.push(`      responses:`);
  lines.push(`        '${statusCode}':`);
  lines.push(`          description: ${statusCode === 200 ? 'OK' : 'Success'}`);

  const block = `\n${lines.join('\n')}\n`;
  fs.appendFileSync(openapiPath, block, 'utf8');
}

function methodUpper(m) {
  return String(m || '').toUpperCase();
}

// Normalize path by replacing path parameters with a placeholder
// Normalize path params (either style) to a common placeholder for fuzzy comparison
function normalizePathForComparison(path) {
  return path.replace(/\{[^}]+\}/g, '{param}').replace(/:[^\/]+/g, '{param}');
}

// Extract routes from the `Route[]` table in routes.ts. Reads the object
// literals directly (method then pattern), so it doesn't care where the
// ROUTES-START/END markers sit relative to the array.
function extractRoutesFromRoutes(routesPath) {
  const source = fs.readFileSync(routesPath, 'utf8');
  const routes = [];
  const re = /\{\s*method:\s*['"]([A-Za-z]+)['"]\s*,\s*pattern:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

// Extract routes from openapi.yaml
function extractRoutesFromOpenApi(openapiPath) {
  const content = fs.readFileSync(openapiPath, 'utf8');
  const routes = [];
  
  try {
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch (err) {
      // js-yaml not available, fall back to regex parsing
      yaml = null;
    }
    
    if (yaml) {
      const spec = yaml.load(content);
      if (spec && spec.paths) {
        for (const [path, methods] of Object.entries(spec.paths)) {
          if (typeof methods === 'object' && methods !== null) {
            for (const [method, _] of Object.entries(methods)) {
              if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
                routes.push({ method: method.toUpperCase(), path: bracesToColon(path) });
              }
            }
          }
        }
      }
    } else {
      // Fallback: simple regex extraction
      const pathRegex = /^\s+([\/\w\{\}]+):/gm;
      const methodRegex = /^\s+([a-z]+):/gm;
      const lines = content.split('\n');
      let currentPath = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const pathMatch = line.match(/^\s+([\/\w\{\}\-]+):/);
        if (pathMatch) {
          currentPath = pathMatch[1];
        } else if (currentPath) {
          const methodMatch = line.match(/^\s+([a-z]+):/);
          if (methodMatch) {
            const method = methodMatch[1].toUpperCase();
            if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(method)) {
              routes.push({ method, path: bracesToColon(currentPath) });
            }
          }
        }
      }
    }
  } catch (err) {
    // If parsing fails completely, return empty array
    // Routes from routes.ts will still be checked
  }

  return routes;
}

// Check for similar routes. newPath must already be full-prefixed, colon-style
// (as produced by addRouteToRoutes), matching what the extractors return.
function checkSimilarRoutes(routesPath, openapiPath, newMethod, newPath) {
  const handlerRoutes = extractRoutesFromRoutes(routesPath);
  const openApiRoutes = extractRoutesFromOpenApi(openapiPath);
  
  // Deduplicate routes (same method + path)
  const routeMap = new Map();
  for (const route of [...handlerRoutes, ...openApiRoutes]) {
    const key = `${route.method}:${route.path}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, route);
    }
  }
  const existingRoutes = Array.from(routeMap.values());
  
  const newMethodUpper = newMethod.toUpperCase();
  const normalizedNewPath = normalizePathForComparison(newPath);
  
  const similarRoutes = [];
  
  for (const route of existingRoutes) {
    const existingMethod = route.method.toUpperCase();
    const normalizedExistingPath = normalizePathForComparison(route.path);
    
    // Check for exact match
    if (existingMethod === newMethodUpper && route.path === newPath) {
      similarRoutes.push({
        type: 'exact',
        route: `${existingMethod} ${route.path}`,
        message: `Exact duplicate route found: ${existingMethod} ${route.path}`
      });
    }
    // Check for similar path structure (same normalized path)
    else if (existingMethod === newMethodUpper && normalizedExistingPath === normalizedNewPath) {
      similarRoutes.push({
        type: 'similar',
        route: `${existingMethod} ${route.path}`,
        message: `Similar route found: ${existingMethod} ${route.path} (same path structure with different parameter names)`
      });
    }
    // Check for potentially conflicting paths
    else if (existingMethod === newMethodUpper) {
      // Check if paths could conflict (e.g., /users/test vs /users/{id})
      const newPathParts = newPath.split('/');
      const existingPathParts = route.path.split('/');
      
      if (newPathParts.length === existingPathParts.length) {
        let hasConflict = false;
        for (let i = 0; i < newPathParts.length; i++) {
          const newPart = newPathParts[i];
          const existingPart = existingPathParts[i];
          
          // Conflict if one is a parameter and the other is static, or both are static but different
          if ((newPart.startsWith(':') && !existingPart.startsWith(':') && existingPart !== '') ||
              (!newPart.startsWith(':') && existingPart.startsWith(':') && newPart !== '') ||
              (!newPart.startsWith(':') && !existingPart.startsWith(':') && newPart !== existingPart && newPart !== '' && existingPart !== '')) {
            hasConflict = false; // Not a conflict, they're different
            break;
          }
          
          // If both have same prefix before first parameter, might conflict
          if (i === 0 && newPart === existingPart && newPathParts.length > 1) {
            hasConflict = true;
          }
        }
        
        if (hasConflict) {
          similarRoutes.push({
            type: 'potential_conflict',
            route: `${existingMethod} ${route.path}`,
            message: `Potentially conflicting route: ${existingMethod} ${route.path} (may match similar requests)`
          });
        }
      }
    }
  }
  
  return similarRoutes;
}

function cmdInitHandler(nameArg) {
  if (!nameArg) error('init-handler requires a name, e.g., orders');
  const lambdasRoot = path.resolve(__dirname, '..');
  const baseDir = path.resolve(lambdasRoot, nameArg);
  ensureDir(baseDir);

  const pkgPath = path.join(baseDir, 'package.json');
  const tsconfigPath = path.join(baseDir, 'tsconfig.json');
  const openapiPath = path.join(baseDir, 'openapi.yaml');
  const handlerPath = path.join(baseDir, 'handler.ts');
  const routesPath = path.join(baseDir, 'routes.ts');
  const dbPath = path.join(baseDir, 'db.ts');
  const authPath = path.join(baseDir, 'auth.ts');
  const swaggerUtilsPath = path.join(baseDir, 'swagger-utils.ts');
  const devServerPath = path.join(baseDir, 'dev-server.ts');
  const readmePath = path.join(baseDir, 'README.md');
  fs.mkdirSync(path.join(baseDir, 'test'));
  const testPath = path.join(baseDir, 'test/example.test.ts')

  writeFileIfAbsent(pkgPath, templatePackageJson());
  writeFileIfAbsent(tsconfigPath, templateTsconfig());
  writeFileIfAbsent(openapiPath, templateOpenApiYaml(nameArg));
  writeFileIfAbsent(swaggerUtilsPath, templateSwaggerUtils());
  writeFileIfAbsent(devServerPath, templateDevServer(nameArg));
  writeFileIfAbsent(handlerPath, templateHandlerTsClean(nameArg));
  writeFileIfAbsent(routesPath, templateRoutesTs());
  writeFileIfAbsent(dbPath, templateDbTs());
  writeFileIfAbsent(authPath, templateAuthTs());
  writeFileIfAbsent(testPath, templateJestSetup(nameArg));
  writeFileIfAbsent(readmePath, templateReadme(nameArg));

  log(`Created handler at ${baseDir} `);
  log('Next:');
  log(`  cd ${nameArg} && npm i && npm run dev`);
  log(`Handler will be available at http://localhost:3000/${nameArg}`);
  log(`Swagger UI: http://localhost:3000/${nameArg}/swagger`);
}

function cmdListRoutes(handlerRel) {
  if (!handlerRel)
    error('list-routes requires: <handlerRel>');
  const lambdasRoot = path.resolve(__dirname, '..');
  const baseDir = path.resolve(lambdasRoot, handlerRel);
  const routesPath = path.join(baseDir, 'routes.ts');
  const openapiPath = path.join(baseDir, 'openapi.yaml');

  if (!fs.existsSync(routesPath))
    error(`routes.ts not found at ${routesPath} `);
  if (!fs.existsSync(openapiPath))
    error(`openapi.yaml not found at ${openapiPath} `);

  // routes.ts is what dispatch() actually executes; health/OPTIONS/404/500
  // are handled centrally and aren't table entries, so they're not listed.
  const allRoutes = extractRoutesFromRoutes(routesPath).map((r) => ({
    method: r.method,
    path: colonToBraces(r.path),
  }));

  // Sort routes by method, then by path
  allRoutes.sort((a, b) => {
    if (a.method !== b.method) {
      return a.method.localeCompare(b.method);
    }
    return a.path.localeCompare(b.path);
  });

  if (allRoutes.length === 0) {
    log(`No routes found in handler: ${handlerRel}`);
    log('Use "add-route" to add routes.');
    return;
  }

  log(`\nRoutes in handler: ${handlerRel}`);
  log('─'.repeat(60));

  // Group by method for better readability
  const routesByMethod = {};
  for (const route of allRoutes) {
    if (!routesByMethod[route.method]) {
      routesByMethod[route.method] = [];
    }
    routesByMethod[route.method].push(route.path);
  }

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  for (const method of methods) {
    if (routesByMethod[method]) {
      for (const routePath of routesByMethod[method]) {
        log(`${method.padEnd(8)} ${routePath}`);
      }
    }
  }

  log('─'.repeat(60));
  log(`Total: ${allRoutes.length} route(s)\n`);
}

function cmdAddRoute(handlerRel, method, apiPath, options = {}) {
  if (!handlerRel || !method || !apiPath)
    error('add-route requires: <handlerRel> <METHOD> <path> [options]');
  const lambdasRoot = path.resolve(__dirname, '..');
  const baseDir = path.resolve(lambdasRoot, handlerRel);
  const routesPath = path.join(baseDir, 'routes.ts');
  const controllersDir = path.join(baseDir, 'controllers');
  const openapiPath = path.join(baseDir, 'openapi.yaml');
  if (!fs.existsSync(routesPath))
    error(`routes.ts not found at ${routesPath} `);
  if (!fs.existsSync(openapiPath))
    error(`openapi.yaml not found at ${openapiPath} `);

  const bracePattern = ensurePrefixed(handlerRel, apiPath);
  const colonPattern = bracesToColon(bracePattern);

  // Check for similar routes before adding
  const similarRoutes = checkSimilarRoutes(routesPath, openapiPath, method, colonPattern);
  if (similarRoutes.length > 0) {
    log('');
    log('⚠️  Warning: Similar routes detected:');
    for (const similar of similarRoutes) {
      if (similar.type === 'exact') {
        error(`Cannot add route: ${similar.message}`);
      } else {
        log(`  - ${similar.message}`);
      }
    }
    log('');
    log('Proceeding with route addition...');
    log('');
  }

  addRouteToRoutes(routesPath, controllersDir, handlerRel, method, apiPath, options);
  addRouteToOpenApi(openapiPath, method, bracePattern, options);
  log(`Added route ${method.toUpperCase()} ${bracePattern} to ${handlerRel} `);
}

function parseExistingReadme(readmePath) {
  if (!fs.existsSync(readmePath)) return null;
  const content = fs.readFileSync(readmePath, 'utf8');

  // Extract description (between ## Description and ## Endpoints)
  let description = '';
  const descMatch = content.match(/## Description\n\n([\s\S]*?)\n\n## Endpoints/);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  // Extract endpoint descriptions from the table (keyed by "METHOD|path")
  const endpointDescriptions = new Map();
  const tableRowRegex = /^\|\s*(\w+)\s*\|\s*(\S+)\s*\|\s*(.*?)\s*\|$/gm;
  let match;
  while ((match = tableRowRegex.exec(content)) !== null) {
    const method = match[1];
    const routePath = match[2];
    const desc = match[3].trim();
    if (method === 'Method' || method === '--------') continue;
    if (desc) {
      endpointDescriptions.set(`${method}|${routePath}`, desc);
    }
  }

  // Extract custom sections after ## Scripts table
  let customSections = '';
  const scriptsIndex = content.indexOf('## Scripts');
  if (scriptsIndex !== -1) {
    // Find the end of the scripts table (last table row starting with |)
    const afterScripts = content.substring(scriptsIndex);
    const lines = afterScripts.split('\n');
    let lastTableLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|')) {
        lastTableLine = i;
      }
    }
    const trailing = lines.slice(lastTableLine + 1).join('\n').trim();
    if (trailing) {
      customSections = trailing;
    }
  }

  return { description, endpointDescriptions, customSections };
}

function collectRoutes(name, routesPath) {
  const routes = [{ method: 'GET', path: `/${name}/health`, description: 'Health check' }];
  for (const route of extractRoutesFromRoutes(routesPath)) {
    routes.push({ method: route.method, path: colonToBraces(route.path), description: '' });
  }
  return routes;
}

function cmdGenerateReadme(handlerRel) {
  const lambdasRoot = path.resolve(__dirname, '..');

  // if no handler specified, generate for all lambdas
  const handlers = [];
  if (!handlerRel) {
    const entries = fs.readdirSync(lambdasRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'tools' && entry.name !== 'node_modules') {
        const handlerPath = path.join(lambdasRoot, entry.name, 'handler.ts');
        if (fs.existsSync(handlerPath)) {
          handlers.push(entry.name);
        }
      }
    }
    if (handlers.length === 0) {
      error('No lambda handlers found');
    }
  } else {
    handlers.push(handlerRel);
  }

  for (const name of handlers) {
    const baseDir = path.resolve(lambdasRoot, name);
    const handlerPath = path.join(baseDir, 'handler.ts');
    const routesPath = path.join(baseDir, 'routes.ts');
    const readmePath = path.join(baseDir, 'README.md');

    if (!fs.existsSync(handlerPath)) {
      log(`Skipping ${name}: handler.ts not found`);
      continue;
    }

    const routes = fs.existsSync(routesPath)
      ? collectRoutes(name, routesPath)
      : [{ method: 'GET', path: `/${name}/health`, description: 'Health check' }];

    // Preserve existing customizations
    const existing = parseExistingReadme(readmePath);
    const options = {};
    if (existing) {
      if (existing.description) {
        options.description = existing.description;
      }
      if (existing.customSections) {
        options.customSections = existing.customSections;
      }
      // Carry over endpoint descriptions from existing table
      for (const route of routes) {
        const key = `${route.method}|${route.path}`;
        if (existing.endpointDescriptions.has(key)) {
          route.description = existing.endpointDescriptions.get(key);
        }
      }
    }

    overwriteFile(readmePath, templateReadme(name, routes, options));
    log(`Generated README.md for ${name}`);
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    log('Commands:');
    log('  init-handler <name>');
    log('    Creates a new Lambda handler with Swagger UI support');
    log('');
    log('  add-route <handlerRel> <METHOD> <path> [options]');
    log('    Adds a new route to an existing handler');
    log('    Options:');
    log('      --body field:type,field:type     Request body fields');
    log('      --query field:type,field:type    Query parameters');
    log('      --headers field:type,field:type  Header parameters');
    log(
      '      --status <code>                  Response status code (default: 200)',
    );
    log('');
    log('  list-routes <handlerRel>');
    log('    Lists all routes in a handler');
    log('');
    log('  generate-readme [handlerRel]');
    log('    Generates/regenerates README.md for a handler (or all handlers if omitted)');
    log('');
    log('  Examples:');
    log('    node lambda-cli.js init-handler users');
    log('    node lambda-cli.js add-route users GET /users/{id}');
    log(
      '    node lambda-cli.js add-route users POST /users --body name:string,email:string',
    );
    log(
      '    node lambda-cli.js add-route users GET /users --query page:number,limit:number',
    );
    log(
      '    node lambda-cli.js add-route users POST /users --body name:string --headers authorization:string --status 201',
    );
    log('    node lambda-cli.js list-routes users');
    log('    node lambda-cli.js generate-readme users');
    log('    node lambda-cli.js generate-readme');
    process.exit(0);
  }
  if (cmd === 'init-handler') {
    const name = rest[0];
    cmdInitHandler(name);
    return;
  }
  if (cmd === 'list-routes') {
    const handlerRel = rest[0];
    cmdListRoutes(handlerRel);
    return;
  }
  if (cmd === 'add-route') {
    const [handlerRel, method, apiPath, ...flags] = rest;
    const options = {};

    for (let i = 0; i < flags.length; i += 2) {
      const flag = flags[i];
      const value = flags[i + 1];

      switch (flag) {
        case '--body':
          options.body = value;
          break;
        case '--query':
          options.query = value;
          break;
        case '--headers':
          options.headers = value;
          break;
        case '--status':
          options.status = parseInt(value) || 200;
          break;
      }
    }

    cmdAddRoute(handlerRel, method, apiPath, options);
    return;
  }
  if (cmd === 'generate-readme') {
    const handlerRel = rest[0];
    cmdGenerateReadme(handlerRel);
    return;
  }
  error(`Unknown command: ${cmd} `);
}

main();
