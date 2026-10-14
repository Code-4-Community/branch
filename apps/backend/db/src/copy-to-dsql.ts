// Stop writes to the source first: the copy fails if the source changed mid-run.
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { Pool, type PoolClient } from 'pg';
import { SCHEMA, createPool, describeTarget } from './config';
import { HISTORY_TABLE, findRollupDrift } from '../testkit';

// Parents before children. Every table in the schema must be listed.
const TABLES = [
  'users',
  'projects',
  'donors',
  'project_memberships',
  'project_donations',
  'expenditures',
  'reports',
  'project_rollup',
  'expenditure_rollup',
];

// Rows per INSERT, and so per transaction: DSQL caps a transaction at 3,000.
const BATCH = 500;

const DSQL_HOST = /^[a-z0-9]+\.dsql\.([a-z0-9-]+)\.on\.aws$/;

function targetPool(): Pool {
  const host = process.env.DSQL_HOST ?? '';
  const region = DSQL_HOST.exec(host)?.[1];
  if (!region) throw new Error(`DSQL_HOST "${host}" is not an Aurora DSQL endpoint`);
  const signer = new DsqlSigner({ hostname: host, region });
  return new Pool({
    host,
    user: 'admin',
    database: 'postgres',
    password: () => signer.getDbConnectAdminAuthToken(),
    ssl: { rejectUnauthorized: true },
    max: 1,
  });
}

// Raw wire text both ways, so no value round-trips through a JS Date or float.
const RAW = { getTypeParser: () => (value: string) => value };

// RDS still carries the kysely-era ledger; it is not data.
async function tablesIn(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> $2
        AND table_name NOT LIKE 'kysely\\_migration%'
      ORDER BY 1`,
    [SCHEMA, HISTORY_TABLE],
  );
  return rows.map((row) => row.t);
}

async function columnsOf(client: PoolClient, table: string): Promise<string[]> {
  return (await columnShapes(client, table)).map((c) => c.split(' ')[0]);
}

async function columnShapes(client: PoolClient, table: string): Promise<string[]> {
  const { rows } = await client.query<{ c: string }>(
    `SELECT column_name || ' ' || data_type
              || COALESCE('(' || character_maximum_length || ')', '')
              || COALESCE('(' || numeric_precision || ',' || numeric_scale || ')', '')
              || ' ' || is_nullable AS c
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [SCHEMA, table],
  );
  return rows.map((row) => row.c);
}

const qualified = (table: string) => `${SCHEMA}.${table}`;
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

// COLLATE "C": DSQL only has C, and RDS's default would sort the same rows differently.
async function digest(client: PoolClient, table: string): Promise<string> {
  const { rows } = await client.query<{ n: string; h: string | null }>(
    `SELECT count(*) AS n,
            md5(string_agg(t::text, E'\\n' ORDER BY t::text COLLATE "C")) AS h
       FROM ${qualified(table)} t`,
  );
  return `${rows[0].n}:${rows[0].h ?? '-'}`;
}

async function digestAll(client: PoolClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const table of TABLES) out.set(table, await digest(client, table));
  return out;
}

async function sequencesOf(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ s: string }>(
    `SELECT sequencename AS s FROM pg_sequences WHERE schemaname = $1 ORDER BY 1`,
    [SCHEMA],
  );
  return rows.map((row) => row.s);
}

async function assertSameShape(source: PoolClient, target: PoolClient): Promise<void> {
  const expected = [...TABLES].sort().join(',');
  for (const [side, client] of [
    ['source', source],
    ['target', target],
  ] as const) {
    const actual = (await tablesIn(client)).join(',');
    if (actual !== expected) {
      throw new Error(`${side} tables are [${actual}], copy-to-dsql knows [${expected}]`);
    }
  }
  for (const table of TABLES) {
    const [a, b] = [await columnShapes(source, table), await columnShapes(target, table)];
    if (a.join(',') !== b.join(',')) {
      throw new Error(`${table}: source columns [${a}] differ from target [${b}]`);
    }
  }
  const [a, b] = [await sequencesOf(source), await sequencesOf(target)];
  if (a.join(',') !== b.join(',')) {
    throw new Error(`source sequences [${a}] differ from target [${b}]`);
  }
}

async function assertTargetReady(target: PoolClient): Promise<void> {
  const { rows } = await target.query<{ failed: string; applied: string }>(
    `SELECT count(*) FILTER (WHERE NOT success) AS failed, count(*) AS applied
       FROM ${qualified(HISTORY_TABLE)}`,
  );
  if (rows[0].applied === '0' || rows[0].failed !== '0') {
    throw new Error('target is not cleanly migrated -- run the migrate step first');
  }
  for (const table of TABLES) {
    const { rows: any } = await target.query(`SELECT 1 FROM ${qualified(table)} LIMIT 1`);
    if (any.length) throw new Error(`target ${table} is not empty -- --reset, then migrate again`);
  }
}

async function copyTable(source: PoolClient, target: PoolClient, table: string): Promise<number> {
  const columns = await columnsOf(source, table);
  const { rows } = await source.query<Record<string, string | null>>({
    text: `SELECT ${columns.map(ident).join(', ')} FROM ${qualified(table)}`,
    types: RAW,
  });
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const values = batch.map(
      (_, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(', ')})`,
    );
    await target.query(
      `INSERT INTO ${qualified(table)} (${columns.map(ident).join(', ')}) VALUES ${values.join(', ')}`,
      batch.flatMap((row) => columns.map((column) => row[column])),
    );
  }
  return rows.length;
}

// From the source's own counters, not max(id): ids of deleted rows stay retired.
async function copySequences(source: PoolClient, target: PoolClient): Promise<void> {
  for (const seq of await sequencesOf(source)) {
    const { rows } = await source.query<{ last_value: string; is_called: boolean }>(
      `SELECT last_value, is_called FROM ${qualified(seq)}`,
    );
    await target.query(`SELECT setval($1, $2, $3)`, [
      qualified(seq),
      rows[0].last_value,
      rows[0].is_called,
    ]);
  }
}

async function verify(source: PoolClient, target: PoolClient): Promise<string[]> {
  const problems: string[] = [];
  const [a, b] = [await digestAll(source), await digestAll(target)];
  for (const table of TABLES) {
    if (a.get(table) !== b.get(table)) {
      problems.push(`${table}: source ${a.get(table)} target ${b.get(table)}`);
    }
  }
  for (const seq of await sequencesOf(source)) {
    const q = `SELECT last_value, is_called FROM ${qualified(seq)}`;
    const [x, y] = [(await source.query(q)).rows[0], (await target.query(q)).rows[0]];
    if (String(x.last_value) !== String(y.last_value) || x.is_called !== y.is_called) {
      problems.push(`${seq}: source ${x.last_value}/${x.is_called} target ${y.last_value}/${y.is_called}`);
    }
  }
  problems.push(...(await findRollupDrift(target)).map((d) => `target drift: ${d}`));
  return problems;
}

// One DDL per statement, autocommitted: DSQL allows one DDL per transaction.
async function reset(target: PoolClient): Promise<void> {
  const { rows: fns } = await target.query<{ sig: string }>(
    `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1`,
    [SCHEMA],
  );
  for (const { sig } of fns) await target.query(`DROP FUNCTION ${sig}`);
  for (const table of [...TABLES].reverse()) {
    await target.query(`DROP TABLE IF EXISTS ${qualified(table)}`);
  }
  await target.query(`DROP TABLE IF EXISTS ${qualified(HISTORY_TABLE)}`);
  for (const seq of await sequencesOf(target)) await target.query(`DROP SEQUENCE ${qualified(seq)}`);
}

export async function copyToDsql(args: string[], makeTarget = targetPool): Promise<void> {
  const sourcePool = createPool();
  const tPool = makeTarget();
  const source = await sourcePool.connect();
  const target = await tPool.connect();
  try {
    const where = `${describeTarget()} -> ${process.env.DSQL_HOST}`;
    if (args.includes('--reset')) {
      await reset(target);
      console.log(`dropped every object in ${SCHEMA} on ${process.env.DSQL_HOST}`);
      return;
    }

    await assertSameShape(source, target);
    if (!args.includes('--verify')) {
      await assertTargetReady(target);
      const before = await digestAll(source);
      for (const table of TABLES) {
        console.log(`${table}: ${await copyTable(source, target, table)} rows`);
      }
      await copySequences(source, target);
      const after = await digestAll(source);
      const moved = TABLES.filter((t) => before.get(t) !== after.get(t));
      if (moved.length) {
        throw new Error(`source changed during the copy (${moved}) -- stop writes, --reset, migrate, copy again`);
      }
    }

    const problems = await verify(source, target);
    if (problems.length) {
      throw new Error(`${where} does not match:\n  ${problems.join('\n  ')}`);
    }
    console.log(`${where}: every table, sequence and rollup matches`);
  } finally {
    source.release();
    target.release();
    await Promise.all([sourcePool.end(), tPool.end()]);
  }
}
