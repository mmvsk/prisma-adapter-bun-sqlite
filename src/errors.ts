/**
 * Error mapping for SQLite to Prisma error conversion
 */

/**
 * Maps SQLite errno values to code strings
 * Reference: https://www.sqlite.org/rescode.html
 */
export const SQLITE_ERROR_MAP: Record<number, string> = {
	1: "SQLITE_ERROR",
	2: "SQLITE_INTERNAL",
	3: "SQLITE_PERM",
	4: "SQLITE_ABORT",
	5: "SQLITE_BUSY",
	6: "SQLITE_LOCKED",
	7: "SQLITE_NOMEM",
	8: "SQLITE_READONLY",
	9: "SQLITE_INTERRUPT",
	10: "SQLITE_IOERR",
	11: "SQLITE_CORRUPT",
	12: "SQLITE_NOTFOUND",
	13: "SQLITE_FULL",
	14: "SQLITE_CANTOPEN",
	15: "SQLITE_PROTOCOL",
	16: "SQLITE_EMPTY",
	17: "SQLITE_SCHEMA",
	18: "SQLITE_TOOBIG",
	19: "SQLITE_CONSTRAINT",
	20: "SQLITE_MISMATCH",
	21: "SQLITE_MISUSE",
	22: "SQLITE_NOLFS",
	23: "SQLITE_AUTH",
	24: "SQLITE_FORMAT",
	25: "SQLITE_RANGE",
	26: "SQLITE_NOTADB",
	// Extended result codes
	2067: "SQLITE_CONSTRAINT_UNIQUE",
	1555: "SQLITE_CONSTRAINT_PRIMARYKEY",
	787: "SQLITE_CONSTRAINT_NOTNULL",
	1811: "SQLITE_CONSTRAINT_FOREIGNKEY",
	1299: "SQLITE_CONSTRAINT_TRIGGER",
};

/**
 * Converts SQLite errors to Prisma error format
 * Matches the official Prisma better-sqlite3 adapter error handling
 *
 * Bun's SQLiteError structure:
 * - Most errors: { errno: 1, message: "...", code: undefined }
 * - Constraint errors: { errno: 2067, message: "...", code: "SQLITE_CONSTRAINT_UNIQUE" }
 */
export function convertDriverError(error: any): any {
	// Handle non-SQLite errors (e.g., internal bugs, TypeErrors)
	// Wrap them in a generic error format for consistency
	if (!error?.message || (typeof error?.code !== "string" && typeof error?.errno !== "number")) {
		return {
			kind: "GenericJs",
			id: 0,
			originalMessage: String(error?.message || error || "Unknown error"),
		};
	}

	const message = error.message;
	// Use .code if available (constraint violations), otherwise map from .errno
	const code = error.code || SQLITE_ERROR_MAP[error.errno] || "SQLITE_UNKNOWN";

	const baseError = {
		originalCode: code,
		originalMessage: message,
	};

	// Map SQLite error codes to Prisma error kinds
	// Reference: https://www.sqlite.org/rescode.html
	switch (code) {
		case "SQLITE_BUSY":
			return {
				...baseError,
				kind: "SocketTimeout",
			};

		case "SQLITE_CONSTRAINT_UNIQUE":
		case "SQLITE_CONSTRAINT_PRIMARYKEY": {
			const fields = message
				.split("constraint failed: ")
				.at(1)
				?.split(", ")
				.map((field: string) => field.split(".").pop()!);
			return {
				...baseError,
				kind: "UniqueConstraintViolation",
				constraint: fields !== undefined ? { fields } : undefined,
			};
		}

		case "SQLITE_CONSTRAINT_NOTNULL": {
			const fields = message
				.split("constraint failed: ")
				.at(1)
				?.split(", ")
				.map((field: string) => field.split(".").pop()!);
			return {
				...baseError,
				kind: "NullConstraintViolation",
				constraint: fields !== undefined ? { fields } : undefined,
			};
		}

		case "SQLITE_CONSTRAINT_FOREIGNKEY":
		case "SQLITE_CONSTRAINT_TRIGGER":
			return {
				...baseError,
				kind: "ForeignKeyConstraintViolation",
				constraint: { foreignKey: {} },
			};

		default:
			// Message-based fallbacks for other errors
			if (message.startsWith("no such table")) {
				return {
					...baseError,
					kind: "TableDoesNotExist",
					table: message.split(": ").at(1),
				};
			}

			if (message.startsWith("no such column")) {
				return {
					...baseError,
					kind: "ColumnNotFound",
					column: message.split(": ").at(1),
				};
			}

			if (message.includes("has no column named")) {
				return {
					...baseError,
					kind: "ColumnNotFound",
					column: message.split("has no column named ").at(1),
				};
			}

			// Unrecognized SQLite error - wrap in GenericJs for consistent error handling
			return {
				kind: "GenericJs",
				id: 0,
				originalCode: code,
				originalMessage: message,
			};
	}
}
