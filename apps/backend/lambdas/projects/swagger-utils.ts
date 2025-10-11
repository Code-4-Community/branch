import * as fs from 'fs';
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
  return `<!DOCTYPE html>
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
      window.ui = SwaggerUIBundle({url: '${specUrl}', dom_id: '#swagger-ui'});
    </script>
  </body>
</html>`;
}
