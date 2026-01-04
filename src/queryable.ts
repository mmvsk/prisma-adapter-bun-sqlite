/**
 * Base queryable class for adapter and transactions
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import {
	Debug,
	DriverAdapterError,
	type SqlQuery,
	type SqlResultSet,
} from "@prisma/driver-adapter-utils";

import type { PrismaBunSqliteOptions } from "./types.js";
import { convertDriverError } from "./errors.js";
import { getColumnTypes, mapArg, mapRow } from "./conversion.js";

export const ADAPTER_NAME = "prisma-adapter-bun-sqlite";
export const debug = Debug("prisma:driver-adapter:bun-sqlite");

/**
 * Base queryable class for both adapter and transactions
 */
export class BunSqliteQueryable {
	private readonly timestampFormat: "iso8601" | "unixepoch-ms";
	private readonly allowBigIntToNumberConversion: boolean;

	constructor(
		protected db: Database,
		protected adapterOptions?: PrismaBunSqliteOptions,
	) {
		this.timestampFormat = adapterOptions?.timestampFormat ?? "iso8601";
		this.allowBigIntToNumberConversion = adapterOptions?.allowBigIntToNumberConversion === true;
	}

	readonly provider = "sqlite" as const;
	readonly adapterName = ADAPTER_NAME;

	/**
	 * Execute a query and return the result set
	 *
	 * Note: Requires Bun 1.3.3+ where statement metadata is available after execution.
	 */
	async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
		const tag = "[js::queryRaw]";
		debug(`${tag} %O`, query);

		try {
			// Map arguments from Prisma format to SQLite format
			// Always run mapArg to ensure strings for ints/decimals are coerced like the official adapters
			const args = query.args.map((arg, i) => {
				const argType = query.argTypes[i];
				return argType ? mapArg(arg, argType, this.timestampFormat) : arg;
			});

			// Use db.query() which caches compiled statements (vs db.prepare() which recompiles every time)
			const stmt = this.db.query(query.sql);

			// IMPORTANT: Use stmt.values() instead of stmt.all() to preserve column order
			// When queries have duplicate column names (e.g., SELECT u.id, p.id),
			// stmt.all() returns objects which lose duplicate keys, causing data corruption.
			// stmt.values() returns arrays preserving all columns in order.
			const rowArrays = stmt.values(...(args as SQLQueryBindings[])) ?? [];

			// Get metadata after execution (Bun 1.3.3+ pattern)
			let columnNames: string[] = [];
			let declaredTypes: (string | null)[] = [];
			try {
				columnNames = stmt.columnNames?.slice() ?? [];
				declaredTypes = stmt.declaredTypes?.slice() ?? [];
			} catch {
				// Metadata not available (edge case), use defaults from first row
				const firstRow = rowArrays[0];
				if (firstRow) {
					columnNames = firstRow.map((_, i) => `column_${i}`);
					declaredTypes = firstRow.map(() => null);
				}
			}

			// Handle column count mismatch due to duplicate names in JOINs
			const firstRow = rowArrays[0];
			if (firstRow && firstRow.length !== columnNames.length) {
				const actualColumnCount = Math.max(
					declaredTypes.length,
					firstRow.length,
					columnNames.length,
				);

				if (columnNames.length < actualColumnCount) {
					for (let i = columnNames.length; i < actualColumnCount; i++) {
						columnNames.push(`column_${i}`);
					}
				}

				if (declaredTypes.length < actualColumnCount) {
					for (let i = declaredTypes.length; i < actualColumnCount; i++) {
						declaredTypes.push(null);
					}
				}
			}

			// Get runtime column types only when needed (optimization suggested by @crishoj)
			// columnTypes is expensive - it resets and steps the statement again
			// Only call it when declaredTypes has nulls (computed columns, expressions, etc.)
			// See: https://github.com/mmvsk/prisma-adapter-bun-sqlite/issues/1
			let runtimeTypes: (string | null)[] = [];
			const needsRuntimeTypes = declaredTypes.some((dt) => dt === null);
			if (needsRuntimeTypes) {
				try {
					runtimeTypes = stmt.columnTypes?.slice() ?? [];
				} catch {
					// columnTypes not available for INSERT/UPDATE/DELETE with RETURNING or certain pragmas
				}
			}

			// Get column types, using runtime types for computed columns
			// Pass first row for type inference when metadata is unavailable (e.g., pragmas)
			const columnTypes = getColumnTypes(declaredTypes, runtimeTypes, firstRow);

			// If no results, return empty set with column metadata
			if (rowArrays.length === 0) {
				return {
					columnNames,
					columnTypes,
					rows: [],
				};
			}

			// Map rows to Prisma format
			const mappedRows = rowArrays.map((rowArray) =>
				mapRow(rowArray, columnTypes, this.allowBigIntToNumberConversion),
			);

			return {
				columnNames,
				columnTypes,
				rows: mappedRows,
			};
		} catch (error: any) {
			throw new DriverAdapterError(convertDriverError(error));
		}
	}

	/**
	 * Execute a query and return the number of affected rows
	 */
	async executeRaw(query: SqlQuery): Promise<number> {
		const tag = "[js::executeRaw]";
		debug(`${tag} %O`, query);

		try {
			// Always map arguments to match official adapter semantics
			const args = query.args.map((arg, i) => {
				const argType = query.argTypes[i];
				return argType ? mapArg(arg, argType, this.timestampFormat) : arg;
			});

			// Use db.query() which caches compiled statements (vs db.prepare() which recompiles every time)
			const stmt = this.db.query(query.sql);
			const result = stmt.run(...(args as any));
			return result.changes;
		} catch (error: any) {
			throw new DriverAdapterError(convertDriverError(error));
		}
	}
}
