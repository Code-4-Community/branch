import fs from 'node:fs';
import { Pool } from 'pg';

/** Every table lives in this schema; the generated DB types key off it. */
export const SCHEMA = 'branch';

/**
 * The one place that knows how to reach the database.
 *
 * DATABASE_URL wins (CI, production, `psql`-style one-offs); otherwise the
 * discrete DB_* vars, which are the same ones the lambdas' db.ts reads, with the
 * same docker-compose defaults. That means `make migrate` needs no configuration
 * at all locally, and CI/prod only need to set what they already set.
 */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const user = encodeURIComponent(process.env.DB_USER ?? 'branch_dev');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? 'password');
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const name = process.env.DB_NAME ?? 'branch_db';

  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

/**
 * TLS settings. Local postgres speaks plaintext; RDS terminates TLS, and when we
 * connect to it from a GitHub runner the traffic crosses the public internet, so
 * CI sets DB_SSL_CA to the AWS bundle and gets full certificate verification.
 * DB_SSL=true without a CA falls back to encrypted-but-unverified.
 */
function sslConfig(): false | { ca: string } | { rejectUnauthorized: false } {
  if (process.env.DB_SSL_CA) {
    return { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') };
  }
  if (process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  return false;
}

export function createPool(): Pool {
  return new Pool({ connectionString: databaseUrl(), ssl: sslConfig() });
}

/** Host and database only -- safe to log, unlike databaseUrl(). */
export function describeTarget(): string {
  const url = new URL(databaseUrl());
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}
