import { z } from 'zod';

/** Single SQL text. Kept generous (1 MB) so large migrations can be submitted. */
export const SqlStringSchema = z.string().trim().min(1).max(1_000_000);

/**
 * Values accepted for `?` placeholders. Booleans are coerced to 1/0 by the
 * service, because SQLite has no native boolean type.
 */
export const BindParamSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const QuerySchema = z.object({
  sql: SqlStringSchema,
  // 999 is the default SQLITE_MAX_VARIABLE_NUMBER for modern SQLite builds.
  params: z.array(BindParamSchema).max(999).default([]),
});
export type QueryType = z.infer<typeof QuerySchema>;

export const PrepareSchema = z.object({ sql: SqlStringSchema });
export type PrepareType = z.infer<typeof PrepareSchema>;

export const BatchSchema = z.object({
  statements: z.array(QuerySchema).min(1).max(100),
});
export type BatchType = z.infer<typeof BatchSchema>;

/** Column metadata returned by `statement.columns()`, trimmed to the useful bits. */
export interface ResultColumn {
  name: string;
  type: string | null;
}

/** Result of a statement that returned rows (`SELECT`, `RETURNING`, `PRAGMA`, ...). */
export interface QueryRowsResult {
  sql: string;
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

/** Result of a statement that returned no rows (`INSERT`, `UPDATE`, `DELETE`, DDL, ...). */
export interface QueryChangesResult {
  sql: string;
  changes: number;
  lastInsertRowid: number;
}

export type QueryResult = QueryChangesResult | QueryRowsResult;

/** Result of `prepare`: the statement is validated, its columns reported. */
export interface PrepareResult {
  sql: string;
  columns: ResultColumn[];
}

export interface BatchResult {
  results: QueryResult[];
}
