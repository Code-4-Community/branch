import type { APIGatewayProxyResult } from 'aws-lambda';

/** JSON response with permissive CORS headers (browser calls cross-origin to API Gateway). */
export function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}
