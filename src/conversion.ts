/**
 * Type conversion functions between SQLite and Prisma formats
 */

import { ColumnTypeEnum, type ArgType, type ColumnType } from "@prisma/driver-adapter-utils";

/**
 * Maps SQLite column type declarations to Prisma ColumnType enum
 * Handles type variants with length specifiers (e.g., VARCHAR(255))
 * and UNSIGNED modifiers (e.g., INTEGER UNSIGNED)
 */
export function mapDeclType(declType: string): ColumnType | null {
	// Normalize: uppercase, trim, and remove length specifiers like (255)
	const normalized = declType.toUpperCase().trim();
	const baseType = normalized.replace(/\([^)]*\)/, "").trim();

	switch (baseType) {
		case "":
			return null;
		case "DECIMAL":
			return ColumnTypeEnum.Numeric;
		case "FLOAT":
			return ColumnTypeEnum.Float;
		case "DOUBLE":
		case "DOUBLE PRECISION":
		case "NUMERIC":
		case "REAL":
			return ColumnTypeEnum.Double;
		// Integer types (without UNSIGNED)
		case "TINYINT":
		case "SMALLINT":
		case "MEDIUMINT":
		case "INT":
		case "INTEGER":
		case "SERIAL":
		case "INT2":
		// Integer types with UNSIGNED modifier
		case "TINYINT UNSIGNED":
		case "SMALLINT UNSIGNED":
		case "MEDIUMINT UNSIGNED":
		case "INT UNSIGNED":
		case "INTEGER UNSIGNED": // Used by Prisma's _prisma_migrations table
			return ColumnTypeEnum.Int32;
		// BigInt types (without UNSIGNED)
		case "BIGINT":
		case "UNSIGNED BIG INT":
		case "INT8":
		// BigInt types with UNSIGNED modifier
		case "BIGINT UNSIGNED":
			return ColumnTypeEnum.Int64;
		case "DATETIME":
		case "TIMESTAMP":
			return ColumnTypeEnum.DateTime;
		case "TIME":
			return ColumnTypeEnum.Time;
		case "DATE":
			return ColumnTypeEnum.Date;
		// Text types (with and without length specifiers)
		case "TEXT":
		case "CLOB":
		case "CHAR": // Added
		case "CHARACTER":
		case "VARCHAR":
		case "VARYING CHARACTER":
		case "NCHAR":
		case "NATIVE CHARACTER":
		case "NVARCHAR":
			return ColumnTypeEnum.Text;
		case "BLOB":
			return ColumnTypeEnum.Bytes;
		case "BOOLEAN":
			return ColumnTypeEnum.Boolean;
		// JSON types
		case "JSON": // Added
		case "JSONB":
			return ColumnTypeEnum.Json;
		default:
			return null;
	}
}

/**
 * Maps SQLite runtime type (from stmt.columnTypes) to Prisma ColumnType
 * Runtime types are: INTEGER, REAL/FLOAT, TEXT, BLOB, NULL
 */
export function mapRuntimeType(runtimeType: string | null): ColumnType | null {
	if (!runtimeType) return null;
	switch (runtimeType.toUpperCase()) {
		case "INTEGER":
			return ColumnTypeEnum.Int64;
		case "REAL":
		case "FLOAT":
			return ColumnTypeEnum.Double;
		case "TEXT":
			return ColumnTypeEnum.Text;
		case "BLOB":
			return ColumnTypeEnum.Bytes;
		case "NULL":
			return null;
		default:
			return null;
	}
}

/**
 * Gets column types array from declarations, using runtime types for computed columns
 * @param declaredTypes - Schema-based types from stmt.declaredTypes (null for computed columns)
 * @param runtimeTypes - Runtime types from stmt.columnTypes (available after execution)
 * @param values - Optional first row values to infer types when metadata unavailable
 */
export function getColumnTypes(
	declaredTypes: (string | null)[],
	runtimeTypes: (string | null)[],
	values?: unknown[],
): ColumnType[] {
	return declaredTypes.map((declType, index) => {
		// First try declared type (more specific: DATE vs DATETIME, etc.)
		if (declType) {
			const mappedType = mapDeclType(declType);
			if (mappedType !== null) return mappedType;
		}

		// Fall back to runtime type for computed columns (COUNT, expressions, etc.)
		const runtimeType = runtimeTypes[index];
		if (runtimeType) {
			const mappedRuntime = mapRuntimeType(runtimeType);
			if (mappedRuntime !== null) return mappedRuntime;
		}

		// If we have actual values, infer type from value
		// This handles pragmas and edge cases where metadata is unavailable
		if (values && index < values.length) {
			const value = values[index];
			const inferredType = inferTypeFromValue(value);
			if (inferredType !== null) return inferredType;
		}

		// Default fallback
		return ColumnTypeEnum.Int32;
	});
}

/**
 * Infers column type from an actual value
 * Used when both declaredTypes and runtimeTypes are unavailable
 */
function inferTypeFromValue(value: unknown): ColumnType | null {
	if (value === null || value === undefined) return null;

	if (typeof value === "bigint") {
		return ColumnTypeEnum.Int64;
	}
	if (typeof value === "number") {
		return Number.isInteger(value) ? ColumnTypeEnum.Int32 : ColumnTypeEnum.Double;
	}
	if (typeof value === "string") {
		return ColumnTypeEnum.Text;
	}
	if (value instanceof Uint8Array || value instanceof ArrayBuffer || Buffer.isBuffer(value)) {
		return ColumnTypeEnum.Bytes;
	}
	if (typeof value === "boolean") {
		return ColumnTypeEnum.Boolean;
	}

	return null;
}

/**
 * Maps a row of values from SQLite format to Prisma format
 */
export function mapRow(row: unknown[], columnTypes: ColumnType[]): unknown[] {
	const result: unknown[] = new Array(row.length);

	for (let i = 0; i < row.length; i++) {
		const value = row[i];

		// Handle BLOB/Bytes - convert to array of numbers
		if (value instanceof ArrayBuffer) {
			result[i] = Array.from(new Uint8Array(value));
			continue;
		}
		if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
			result[i] = Array.from(value);
			continue;
		}

		// Handle integers stored as floats - truncate to integer
		if (
			typeof value === "number" &&
			(columnTypes[i] === ColumnTypeEnum.Int32 || columnTypes[i] === ColumnTypeEnum.Int64) &&
			!Number.isInteger(value)
		) {
			result[i] = Math.trunc(value);
			continue;
		}

		// Handle DateTime - convert to ISO string
		if (
			(typeof value === "number" || typeof value === "bigint") &&
			columnTypes[i] === ColumnTypeEnum.DateTime
		) {
			result[i] = new Date(Number(value)).toISOString();
			continue;
		}

		// Handle BigInt - convert to string for Prisma
		if (typeof value === "bigint") {
			result[i] = value.toString();
			continue;
		}

		result[i] = value;
	}

	return result;
}

/**
 * Maps arguments from Prisma format to SQLite format
 * Matches the official Prisma better-sqlite3 adapter argument handling
 */
export function mapArg(
	arg: unknown,
	argType: ArgType,
	timestampFormat: "iso8601" | "unixepoch-ms",
): unknown {
	if (arg === null) {
		return null;
	}

	// SQLite does not natively support booleans - convert to 1/0
	if (typeof arg === "boolean") {
		return arg ? 1 : 0;
	}

	// Fast path: use switch statement for better performance
	switch (argType.scalarType) {
		case "int":
			return typeof arg === "string" ? Number.parseInt(arg) : arg;

		case "float":
		case "decimal":
			// Note: decimal can lose precision, but SQLite does not have a native decimal type
			return typeof arg === "string" ? Number.parseFloat(arg) : arg;

		case "bigint":
			return typeof arg === "string" ? BigInt(arg) : arg;

		case "datetime": {
			// Convert string to Date if needed
			const date = typeof arg === "string" ? new Date(arg) : arg;
			if (date instanceof Date) {
				if (timestampFormat === "unixepoch-ms") {
					return date.getTime();
				}
				// Use +00:00 suffix instead of Z for better SQLite compatibility
				// Matches official @prisma/adapter-better-sqlite3 behavior
				return date.toISOString().replace("Z", "+00:00");
			}
			return date;
		}

		case "bytes":
			if (typeof arg === "string") {
				return Buffer.from(arg, "base64");
			}
			if (Array.isArray(arg)) {
				return Buffer.from(arg);
			}
			return arg;

		default:
			return arg;
	}
}
