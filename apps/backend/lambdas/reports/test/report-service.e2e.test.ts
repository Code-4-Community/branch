/**
 * A generated report is a statement of what a project spent. Expenditures
 * still pending review, or already denied, are not spend, so they stay out of
 * both the table and the total the report footer prints.
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

import db from '../db';
import { fetchReportData } from '../report-service';

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
