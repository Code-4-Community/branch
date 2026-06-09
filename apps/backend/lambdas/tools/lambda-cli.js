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
    "@types/aws-lambda": "^8.10.131",
    "@types/node": "^20.11.30",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5",
    "js-yaml": "^4.1.0",
    "start-server-and-test": "^2.1.1"
  },
  "dependencies": {
    "@branch/lambda-auth": "file:../../../../shared/lambda-auth",
    "dotenv": "^16.4.7",
    "jest":"^30.2.0"
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
  "include": ["*.ts"],
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
  - url: http://localhost:3000/${title}
paths:
  /health:
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

function templateHandlerTs() {
  return `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as http from 'http';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    let normalizedPath = (event.path || '').replace(/\\/$/, '');
    const method = (event.httpMethod || 'GET').toUpperCase();
    if (normalizedPath.length === 0) {
      normalizedPath = '/';
    }

    if ((normalizedPath.endsWith('/swagger.json') || normalizedPath === '/swagger.json') && method === 'GET') {
      const spec = loadOpenApiSpec();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) };
    }
    if ((normalizedPath.endsWith('/swagger') || normalizedPath === '/swagger') && method === 'GET') {
      const html = getSwaggerHtml('/swagger.json');
      return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
    }

    // Built-in default route
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true });
    }

    // >>> ROUTES-START (marker: do not remove)
    // Add new routes above the 404 using the CLI
    // <<< ROUTES-END

    return json(404, { message: 'Not Found' });
  } catch (err) {
    return json(500, { message: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function loadOpenApiSpec(): unknown {
  const yamlPath = path.join(__dirname, 'openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    const file = fs.readFileSync(yamlPath, 'utf8');
    return yaml.load(file);
  }
  return { openapi: '3.0.0', info: { title: 'Local API', version: '1.0.0' }, paths: {} };
}

function getSwaggerHtml(specUrl: string): string {
  return \`<!DOCTYPE html>\n
<html lang="en">\n
  <head>\n
    <meta charset="UTF-8" />\n
    <meta name="viewport" content="width=device-width, initial-scale=1" />\n
    <title>Swagger UI</title>\n
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />\n
  </head>\n
  <body>\n
    <div id="swagger-ui"></div>\n
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>\n
    <script>\n
      window.ui = SwaggerUIBundle({url: '\${specUrl}', dom_id: '#swagger-ui'});\n
    </script>\n
  </body>\n
</html>\`;
}

// Local bootstrap
if (typeof require !== 'undefined' && require.main === module) {
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [] as Buffer[];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const bodyRaw = Buffer.concat(chunks).toString('utf8');
        const fullUrl = new URL(req.url || '/', \`http://localhost:\${process.env.PORT || 3000}\`);
        const event: APIGatewayProxyEvent = {
          body: bodyRaw || null,
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])) as Record<string, string>,
          httpMethod: (req.method || 'GET').toUpperCase(),
          isBase64Encoded: false,
          multiValueHeaders: {},
          multiValueQueryStringParameters: null,
          path: fullUrl.pathname,
          pathParameters: null,
          queryStringParameters: Object.fromEntries(fullUrl.searchParams.entries()),
          requestContext: {} as any,
          resource: fullUrl.pathname,
          stageVariables: null
        };
        const result = await handler(event);
        res.statusCode = result.statusCode || 200;
        if (result.headers) {
          for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, String(v));
        }
        res.end(result.body);
      });
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: 'Local bootstrap error' }));
    }
  });
const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
    console.log(\`Local Lambda listening on http://localhost:\${port}\`);
    console.log(\`Swagger UI: http://localhost:\${port}/swagger\`);
    console.log(\`Swagger JSON: http://localhost:\${port}/swagger.json\`);
});
}
`;
}

function templateHandlerTsClean() {
  return `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    // <<< ROUTES-END

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
`;
}

function addRouteToHandler(handlerPath, method, apiPath, options = {}) {
  const source = fs.readFileSync(handlerPath, 'utf8');
  const marker = '// <<< ROUTES-END';
  const insertIndex = source.indexOf(marker);
  if (insertIndex === -1)
    error('Marker not found in handler.ts (// <<< ROUTES-END)');

  const methodUpper = method.toUpperCase();

  // Extract path parameters
  const pathParams = [];
  const pathParamRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = pathParamRegex.exec(apiPath)) !== null) {
    pathParams.push(match[1]);
  }

  // Generate path parameter extraction using URL parsing
  let pathParamExtraction = '';
  if (pathParams.length > 0) {
    // Normalize apiPath to always have leading slash for consistent splitting
    const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const pathParts = normalizedApiPath.split('/');
    const extractions = [];

    pathParts.forEach((part, index) => {
      if (part.startsWith('{') && part.endsWith('}')) {
        const paramName = part.slice(1, -1);
        // normalizedPath always starts with '/', so split('/') gives ['', ...parts]
        // index already accounts for the leading empty string
        extractions.push(
          `const ${paramName} = normalizedPath.split('/')[${index
          }];\n      if (!${paramName}) return json(400, { message: '${paramName} is required' });`,
        );
      }
    });

    pathParamExtraction = extractions.join('\n      ');
  }

  // Generate body parsing for methods that typically have bodies
  const needsBody =
    ['POST', 'PUT', 'PATCH'].includes(methodUpper) || options.body;
  const bodyParse = needsBody
    ? `const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};`
    : '';

  // Generate query parameter extraction if specified
  const queryParse = options.query
    ? `const query = event.queryStringParameters || {};`
    : '';

  // Generate header extraction if specified
  const headerParse = options.headers
    ? `const headers = event.headers || {};`
    : '';

  // Generate response
  const statusCode = options.status || 200;
  const responseProps = ['ok: true', `route: '${methodUpper} ${apiPath}'`];

  if (pathParams.length > 0) {
    const pathParamObj = pathParams.map((param) => `${param}`).join(', ');
    responseProps.push(
      `pathParams: { ${pathParams.map((p) => `${p}`).join(', ')} }`,
    );
  }
  if (options.query) responseProps.push('query');
  if (options.headers) responseProps.push('headers');
  if (needsBody) responseProps.push('body');

  // Use simple string matching instead of regex for reliability
  let matchCondition;
  if (pathParams.length > 0) {
    // For paths with parameters, use startsWith and split logic
    // Normalize apiPath to always have leading slash for consistent splitting
    const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const pathParts = normalizedApiPath.split('/');
    const staticParts = pathParts.filter(
      (part) => !part.startsWith('{'),
    ).length;
    const pathPrefix = normalizedApiPath.split('{')[0]; // Get part before first parameter

    // normalizedPath always starts with '/', so split('/') includes leading empty string
    matchCondition = `normalizedPath.startsWith('${pathPrefix}') && normalizedPath.split('/').length === ${pathParts.length
      }`;
  } else {
    // For static paths, normalize to ensure leading slash
    const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    matchCondition = `normalizedPath === '${normalizedApiPath}'`;
  }

  const codeLines = [
    pathParamExtraction,
    bodyParse,
    queryParse,
    headerParse,
    '// TODO: Add your business logic here',
    `return json(${statusCode}, { ${responseProps.join(', ')} });`,
  ].filter(Boolean);

  const snippet = `
    // ${methodUpper} ${apiPath}
    if (${matchCondition} && method === '${methodUpper}') {
      ${codeLines.join('\n      ')}
    }
`;

  const updated = source.replace(marker, `${snippet}    ${marker} `);
  fs.writeFileSync(handlerPath, updated, 'utf8');
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
function normalizePathForComparison(path) {
  return path.replace(/\{[^}]+\}/g, '{param}');
}

// Extract routes from handler.ts
function extractRoutesFromHandler(handlerPath) {
  const source = fs.readFileSync(handlerPath, 'utf8');
  const routes = [];
  
  // Find the routes section between ROUTES-START and ROUTES-END
  const startMarker = '// >>> ROUTES-START';
  const endMarker = '// <<< ROUTES-END';
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  
  if (startIndex === -1 || endIndex === -1) {
    return routes;
  }
  
  const routesSection = source.substring(startIndex, endIndex);
  
  // Extract route comments - pattern: // METHOD /path
  // The comment typically contains the actual API path
  const routeCommentRegex = /\/\/\s*([A-Z]+)\s+([\/\w\{\}\-]+)/g;
  
  let commentMatch;
  while ((commentMatch = routeCommentRegex.exec(routesSection)) !== null) {
    const method = commentMatch[1];
    let path = commentMatch[2].trim();
    
    // Find the if condition that follows this comment to get the actual method
    const afterComment = routesSection.substring(commentMatch.index + commentMatch[0].length);
    const ifMatch = afterComment.match(/if\s*\([^)]*method\s*===\s*['"]([A-Z]+)['"]/);
    const actualMethod = ifMatch ? ifMatch[1] : method;
    
    // Ensure path starts with /
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    // Only add if we have a valid path
    if (path && path.startsWith('/')) {
      routes.push({ method: actualMethod, path });
    }
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
                routes.push({ method: method.toUpperCase(), path });
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
              routes.push({ method, path: currentPath });
            }
          }
        }
      }
    }
  } catch (err) {
    // If parsing fails completely, return empty array
    // Routes from handler.ts will still be checked
  }
  
  return routes;
}

// Check for similar routes
function checkSimilarRoutes(handlerPath, openapiPath, newMethod, newPath) {
  const handlerRoutes = extractRoutesFromHandler(handlerPath);
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
          if ((newPart.startsWith('{') && !existingPart.startsWith('{') && existingPart !== '') ||
              (!newPart.startsWith('{') && existingPart.startsWith('{') && newPart !== '') ||
              (!newPart.startsWith('{') && !existingPart.startsWith('{') && newPart !== existingPart && newPart !== '' && existingPart !== '')) {
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
  writeFileIfAbsent(handlerPath, templateHandlerTsClean());
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
  const handlerPath = path.join(baseDir, 'handler.ts');
  const openapiPath = path.join(baseDir, 'openapi.yaml');
  
  if (!fs.existsSync(handlerPath))
    error(`handler.ts not found at ${handlerPath} `);
  if (!fs.existsSync(openapiPath))
    error(`openapi.yaml not found at ${openapiPath} `);

  const handlerRoutes = extractRoutesFromHandler(handlerPath);
  const openApiRoutes = extractRoutesFromOpenApi(openapiPath);
  
  // Deduplicate routes (same method + path)
  const routeMap = new Map();
  for (const route of [...handlerRoutes, ...openApiRoutes]) {
    const key = `${route.method}:${route.path}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, route);
    }
  }
  const allRoutes = Array.from(routeMap.values());
  
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
  const handlerPath = path.join(baseDir, 'handler.ts');
  const openapiPath = path.join(baseDir, 'openapi.yaml');
  if (!fs.existsSync(handlerPath))
    error(`handler.ts not found at ${handlerPath} `);
  if (!fs.existsSync(openapiPath))
    error(`openapi.yaml not found at ${openapiPath} `);

  // Check for similar routes before adding
  const similarRoutes = checkSimilarRoutes(handlerPath, openapiPath, method, apiPath);
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

  addRouteToHandler(handlerPath, method, apiPath, options);
  addRouteToOpenApi(openapiPath, method, apiPath, options);
  log(`Added route ${method.toUpperCase()} ${apiPath} to ${handlerRel} `);
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

function collectRoutes(handlerPath, openapiPath) {
  const handlerRoutes = extractRoutesFromHandler(handlerPath);
  const openApiRoutes = extractRoutesFromOpenApi(openapiPath);

  const routeMap = new Map();
  for (const route of [...handlerRoutes, ...openApiRoutes]) {
    const key = `${route.method}:${route.path}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, route);
    }
  }

  const routes = [{ method: 'GET', path: '/health', description: 'Health check' }];
  for (const route of routeMap.values()) {
    if (route.method === 'GET' && route.path === '/health') continue;
    routes.push({ method: route.method, path: route.path, description: '' });
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
    const openapiPath = path.join(baseDir, 'openapi.yaml');
    const readmePath = path.join(baseDir, 'README.md');

    if (!fs.existsSync(handlerPath)) {
      log(`Skipping ${name}: handler.ts not found`);
      continue;
    }

    const routes = fs.existsSync(openapiPath)
      ? collectRoutes(handlerPath, openapiPath)
      : [{ method: 'GET', path: '/health', description: 'Health check' }];

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
