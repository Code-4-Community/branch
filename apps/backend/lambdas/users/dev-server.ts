import { handler } from './handler';
import { loadOpenApiSpec, getSwaggerHtml } from './swagger-utils';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { APIGatewayProxyEvent } from 'aws-lambda';

const HANDLER_NAME = 'users';
const BASE_PATH = `/${HANDLER_NAME}`;

// Check if shared server exists, if not create it
const SHARED_SERVER_PORT = 3000;
const LOCK_FILE = path.join(__dirname, '..', '.dev-server.lock');

async function startOrJoinServer() {
  // Try to register this handler with existing server
  try {
    const response = await fetch(`http://localhost:${SHARED_SERVER_PORT}/_register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handlerName: HANDLER_NAME,
        handlerPath: __dirname
      })
    });

    if (response.ok) {
      console.log(`Registered ${HANDLER_NAME} with existing dev server`);
      console.log(`Handler available at: http://localhost:${SHARED_SERVER_PORT}${BASE_PATH}`);
      console.log(`Swagger UI: http://localhost:${SHARED_SERVER_PORT}${BASE_PATH}/swagger`);
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
        const fullUrl = new URL(req.url || '/', `http://localhost:${SHARED_SERVER_PORT}`);

        // Handle registration endpoint
        if (fullUrl.pathname === '/_register' && req.method === 'POST') {
          const { handlerName, handlerPath } = JSON.parse(bodyRaw);
          try {
            const handlerModule = require(path.join(handlerPath, 'handler.ts'));
            const swaggerUtils = require(path.join(handlerPath, 'swagger-utils.ts'));
            handlers.set(handlerName, { handler: handlerModule.handler, swaggerUtils, handlerPath });
            res.statusCode = 200;
            res.end('OK');
            console.log(`Registered handler: ${handlerName}`);
          } catch (err) {
            res.statusCode = 500;
            res.end('Failed to load handler');
          }
          return;
        }

        // Handle root route - show available handlers
        if (fullUrl.pathname === '/' && req.method === 'GET') {
          const handlerList = Array.from(handlers.keys()).map(name =>
            `<li><a href="/${name}">${name}</a> - <a href="/${name}/swagger">Swagger UI</a></li>`
          ).join('');

          const html = `<!DOCTYPE html>
<html><head><title>Lambda Dev Server</title></head>
<body>
  <h1>Lambda Development Server</h1>
  <h2>Available Handlers:</h2>
  <ul>${handlerList}</ul>
</body></html>`;

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
          res.end(JSON.stringify({ message: `Handler '${handlerName}' not found` }));
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
          const html = swaggerUtils.getSwaggerHtml(`/${handlerName}/swagger.json`);
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
    console.log(`Lambda Dev Server started on http://localhost:${SHARED_SERVER_PORT}`);
    console.log(`Available handlers will be listed at http://localhost:${SHARED_SERVER_PORT}`);

    // Register this handler
    handlers.set(HANDLER_NAME, {
      handler,
      swaggerUtils: { loadOpenApiSpec, getSwaggerHtml },
      handlerPath: __dirname
    });

    console.log(`Handler '${HANDLER_NAME}' available at: http://localhost:${SHARED_SERVER_PORT}${BASE_PATH}`);
    console.log(`Swagger UI: http://localhost:${SHARED_SERVER_PORT}${BASE_PATH}/swagger`);
  });
}

startOrJoinServer().catch(console.error);
