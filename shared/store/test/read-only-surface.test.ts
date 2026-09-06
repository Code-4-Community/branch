import type { ReadOnlyDb } from '../src'

// Type-only import: nothing here constructs the pg Pool.

type Assert<T extends true> = T
type Has<T, K extends string> = K extends keyof T ? true : false
type Lacks<T, K extends string> = Has<T, K> extends false ? true : false

// Reads stay reachable.
type _Select = Assert<Has<ReadOnlyDb, 'selectFrom'>>
type _Fn = Assert<Has<ReadOnlyDb, 'fn'>>

// Writes do not. If any of these start failing, a controller can bypass the
// store and the rollup tables go stale with nothing to catch it.
type _NoInsert = Assert<Lacks<ReadOnlyDb, 'insertInto'>>
type _NoUpdate = Assert<Lacks<ReadOnlyDb, 'updateTable'>>
type _NoDelete = Assert<Lacks<ReadOnlyDb, 'deleteFrom'>>
type _NoTx = Assert<Lacks<ReadOnlyDb, 'transaction'>>
type _NoSchema = Assert<Lacks<ReadOnlyDb, 'schema'>>
type _NoWithSchema = Assert<Lacks<ReadOnlyDb, 'withSchema'>>
type _NoWith = Assert<Lacks<ReadOnlyDb, 'with'>>

it('keeps the write surface off the exported handle', () => {
  // The assertions above are compile-time; ts-jest fails the suite if they break.
  expect(true).toBe(true)
})
