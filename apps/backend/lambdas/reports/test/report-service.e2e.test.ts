/**
 * A generated report is a statement of what a project spent. Expenditures
 * still pending review, or already denied, are not spend, so they stay out of
 * both the table and the total the report footer prints.
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

import db from '../db';
import { fetchReportData, keyFromObjectUrl, objectUrlFor, reportKeyPrefix } from '../report-service';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await resetData(client);
    await client.query('DELETE FROM branch.expenditures');
    await client.query(`
      INSERT INTO branch.expenditures
        (project_id, entered_by, amount, category, description, status, spent_on)
      VALUES
        (1, 1, 1000, 'Travel', 'approved', 'approved', '2025-02-10'),
        (1, 1, 2000, 'Travel', 'pending', 'pending', '2025-02-11'),
        (1, 1, 4000, 'Travel', 'denied', 'denied', '2025-02-12'),
        (1, 1, 8000, 'Travel', 'needs info', 'needs_more_info', '2025-02-13')
    `);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
  await db.destroy();
});

describe('fetchReportData', () => {
  test('returns approved expenditures only', async () => {
    const data = await fetchReportData(1);
    expect(data).not.toBeNull();
    expect(data!.expenditures).toHaveLength(1);
    expect(data!.expenditures[0].description).toBe('approved');
  });

  test('the total the report prints covers approved expenditures only', async () => {
    const data = await fetchReportData(1);
    const total = data!.expenditures.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    expect(total).toBe(1000);
  });
});

// keyFromObjectUrl/objectUrlFor are pure functions but depend on
// REPORTS_BUCKET_NAME and AWS_REGION at call time, so each test sets its own
// env rather than relying on a shared beforeAll value.
describe('objectUrlFor / keyFromObjectUrl', () => {
  const ORIGINAL_BUCKET = process.env.REPORTS_BUCKET_NAME;
  const ORIGINAL_REGION = process.env.AWS_REGION;

  beforeEach(() => {
    process.env.REPORTS_BUCKET_NAME = 'bucket';
    process.env.AWS_REGION = 'us-east-2';
  });

  afterAll(() => {
    process.env.REPORTS_BUCKET_NAME = ORIGINAL_BUCKET;
    process.env.AWS_REGION = ORIGINAL_REGION;
  });

  test('objectUrlFor and keyFromObjectUrl round-trip a key', () => {
    const key = `${reportKeyPrefix(1)}report.pdf`;
    const url = objectUrlFor(key);
    expect(keyFromObjectUrl(url)).toBe(key);
  });

  test('a region-less legacy host still resolves the key, for rows written before objectUrlFor', () => {
    const legacyUrl = 'https://bucket.s3.amazonaws.com/reports/1/old-report.pdf';
    expect(keyFromObjectUrl(legacyUrl)).toBe('reports/1/old-report.pdf');
  });

  test('a non-https URL is rejected', () => {
    const httpUrl = 'http://bucket.s3.us-east-2.amazonaws.com/reports/1/report.pdf';
    expect(keyFromObjectUrl(httpUrl)).toBeNull();
  });

  test('a URL pointed at a different bucket entirely is rejected', () => {
    const otherBucketUrl = 'https://someone-elses-bucket.s3.us-east-2.amazonaws.com/reports/1/report.pdf';
    expect(keyFromObjectUrl(otherBucketUrl)).toBeNull();
  });

  test('a malformed percent-encoded path is caught and returns null rather than throwing', () => {
    const malformedUrl = 'https://bucket.s3.us-east-2.amazonaws.com/reports/1/%ZZbad.pdf';
    expect(() => keyFromObjectUrl(malformedUrl)).not.toThrow();
    expect(keyFromObjectUrl(malformedUrl)).toBeNull();
  });

  test('a completely invalid URL string returns null rather than throwing', () => {
    expect(() => keyFromObjectUrl('not a url at all')).not.toThrow();
    expect(keyFromObjectUrl('not a url at all')).toBeNull();
  });

  test('an empty path (just the bucket root) returns null', () => {
    const rootUrl = 'https://bucket.s3.us-east-2.amazonaws.com/';
    expect(keyFromObjectUrl(rootUrl)).toBeNull();
  });
});