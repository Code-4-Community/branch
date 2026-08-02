/**
 * Post-processing applied to kysely-codegen's output before it is written to
 * shared/types/db-types.d.ts.
 *
 * This used to be an inline `node -e` heredoc inside
 * .github/workflows/regenerate-db-types.yaml. It lives here so the local
 * `npm run types` and the workflow produce byte-identical output by
 * construction, rather than by two copies staying in sync by discipline.
 */

const KYSELY_IMPORT = 'import type { ColumnType } from "kysely";';

const LOCAL_COLUMN_TYPE = [
  '/**',
  " * Structurally identical to kysely's ColumnType, defined locally so this",
  ' * package has no dependencies and lambdas stay fully self contained.',
  ' */',
  'type ColumnType<SelectType, InsertType = SelectType, UpdateType = SelectType> = {',
  '  readonly __select__: SelectType;',
  '  readonly __insert__: InsertType;',
  '  readonly __update__: UpdateType;',
  '};',
].join('\n');

/**
 * Swaps kysely's ColumnType import for a local copy so @branch/types stays
 * dependency-free. Throws if the import is absent -- a silent no-op would ship a
 * shared package that imports something it does not depend on.
 */
export function postprocess(generated: string): string {
  if (!generated.includes(KYSELY_IMPORT)) {
    throw new Error(
      `expected ${JSON.stringify(KYSELY_IMPORT)} in the kysely-codegen output`,
    );
  }
  return generated.replace(KYSELY_IMPORT, LOCAL_COLUMN_TYPE);
}
