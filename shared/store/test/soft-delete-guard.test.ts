import fs from 'node:fs'
import path from 'node:path'

const SOFT_TABLES = ['users', 'projects', 'donors', 'project_donations', 'expenditures', 'reports']
const ROOT = path.resolve(__dirname, '../../..')
const SOURCES = [
  'shared/store/src',
  'shared/lambda-auth/src',
  ...fs
    .readdirSync(path.join(ROOT, 'apps/backend/lambdas'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `apps/backend/lambdas/${d.name}`),
]
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test', 'coverage'])

const BUILDER = new RegExp(
  String.raw`\.(selectFrom|innerJoin|leftJoin|rightJoin|fullJoin)\(\s*['"]branch\.(${SOFT_TABLES.join('|')})(?:\s+as\s+(\w+))?['"]`,
  'g',
)
const RAW = new RegExp(String.raw`\b(?:FROM|JOIN)\s+branch\.(${SOFT_TABLES.join('|')})\b(?:\s+(?:AS\s+)?(\w+))?`, 'gi')
const CHAIN_END = /\.(execute|executeTakeFirst|executeTakeFirstOrThrow|compile|stream)\(/g
const SQL_KEYWORDS = new Set(['where', 'on', 'join', 'left', 'inner', 'group', 'order', 'limit', 'using'])

function chainWindow(src: string, from: number): string {
  CHAIN_END.lastIndex = from
  const end = CHAIN_END.exec(src)
  return src.slice(from, end ? end.index : src.length)
}

function optedOut(src: string, index: number): boolean {
  const lineStart = src.lastIndexOf('\n', index)
  const prevStart = src.lastIndexOf('\n', lineStart - 1)
  return /soft-delete-ok:/.test(src.slice(prevStart, index))
}

export function findUnfilteredReads(src: string): string[] {
  const misses: string[] = []
  const lineOf = (i: number) => src.slice(0, i).split('\n').length

  for (const m of src.matchAll(BUILDER)) {
    const [, , table, alias] = m
    const window = chainWindow(src, m.index! + m[0].length)
    const wanted = alias
      ? [`'${alias}.deleted_at'`, `"${alias}.deleted_at"`]
      : [`'deleted_at'`, `"deleted_at"`, `'branch.${table}.deleted_at'`]
    if (!wanted.some((w) => window.includes(w)) && !optedOut(src, m.index!)) {
      misses.push(`line ${lineOf(m.index!)}: ${m[0].slice(1)}`)
    }
  }

  for (const m of src.matchAll(RAW)) {
    const [, , rawAlias] = m
    const alias = rawAlias && !SQL_KEYWORDS.has(rawAlias.toLowerCase()) ? rawAlias : undefined
    const close = src.indexOf('`', m.index! + m[0].length)
    const window = src.slice(m.index! + m[0].length, close === -1 ? src.length : close)
    const ok = alias ? new RegExp(String.raw`\b${alias}\.deleted_at\b`).test(window) : /deleted_at/.test(window)
    if (!ok && !optedOut(src, m.index!)) misses.push(`line ${lineOf(m.index!)}: ${m[0]}`)
  }
  return misses
}

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path.join(dir, entry.name))
    return /\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [path.join(dir, entry.name)] : []
  })
}

describe('soft-delete guard', () => {
  it('catches an unfiltered read', () => {
    expect(findUnfilteredReads(`db.selectFrom('branch.donors').selectAll().execute()`)).toHaveLength(1)
    expect(
      findUnfilteredReads(
        `db.selectFrom('branch.expenditures as e').leftJoin('branch.users as u', 'u.user_id', 'e.entered_by').where('e.deleted_at', 'is', null).execute()`,
      ),
    ).toEqual([expect.stringContaining('branch.users as u')])
    expect(findUnfilteredReads('sql`SELECT * FROM branch.reports r WHERE r.project_id = 1`')).toHaveLength(1)
  })

  it('accepts filtered reads', () => {
    expect(
      findUnfilteredReads(
        `db.selectFrom('branch.donors').where('deleted_at', 'is', null).selectAll().execute()`,
      ),
    ).toEqual([])
    expect(
      findUnfilteredReads(
        `db.selectFrom('branch.expenditures as e').leftJoin('branch.users as u', (j) => j.onRef('u.user_id', '=', 'e.entered_by').on('u.deleted_at', 'is', null)).where('e.deleted_at', 'is', null).execute()`,
      ),
    ).toEqual([])
  })

  it('finds no unfiltered read in the lambdas, the store or lambda-auth', () => {
    const files = SOURCES.flatMap(sourceFiles)
    expect(files.length).toBeGreaterThan(20)
    const misses = files.flatMap((file) =>
      findUnfilteredReads(fs.readFileSync(path.join(ROOT, file), 'utf8')).map((miss) => `${file} ${miss}`),
    )
    expect(misses).toEqual([])
  })
})
