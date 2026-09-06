import type { APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '@branch/lambda-telemetry';
import { json } from './response';

/**
 * Hand an error to Sentry.
 *
 * The Sentry SDK ships in the Lambda layer, never in these bundles, so the
 * require resolves through NODE_PATH in prod and throws locally and in tests,
 * where reporting is a no-op. The layer's `wrapHandler` only records uncaught
 * throws, and every lambda returns a JSON 500 rather than throwing — so an
 * error nobody passes through here is an error Sentry never sees.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/aws-serverless') as {
      captureException: (error: unknown, captureContext?: unknown) => void;
    };
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Layer absent, or the SDK itself failed. Reporting a failure must never
    // replace the failure being reported.
  }
}

/**
 * Log, report, and return a 500. Use instead of a bare `json(500, ...)` in a
 * catch — the status the caller sees is unchanged, but the error stops being
 * invisible. `body` merges extra fields into the response for the handful of
 * routes that already return more than a message.
 *
 * The log line goes to Loki as well as CloudWatch, carrying the request id and
 * route from the enclosing `dispatch`.
 */
export function serverError(
  err: unknown,
  message: string,
  body?: Record<string, unknown>,
): APIGatewayProxyResult {
  logger.error(message, { error: err });
  reportError(err);
  return json(500, { message, ...body });
}
