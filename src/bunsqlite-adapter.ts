import { Database } from "bun:sqlite";
import {
	ColumnTypeEnum,
	type ArgType,
	type ColumnType,
	DriverAdapterError,
	type IsolationLevel,
	type SqlDriverAdapter,
	type SqlQuery,
	type SqlResultSet,
	type Transaction,
	type TransactionOptions,
} from "@prisma/driver-adapter-utils";

const ADAPTER_NAME = "@prisma/adapter-bunsqlite";

/**
 * Adapter options for BunSQLite
 */
export type PrismaBunSqlite3Options = {
	timestampFormat?: "iso8601" | "unixepoch-ms";
	/**
	 * Enable safe 64-bit integer handling.
	 * When true, BIGINT columns return as BigInt instead of number,
	 * preventing precision loss for values > Number.MAX_SAFE_INTEGER.
	 * @default true
	 */
	safeIntegers?: boolean;
};

/**
 * Maps SQLite column type declarations to Prisma ColumnType enum
 */
function mapDeclType(declType: string): ColumnType | null {
	switch (declType.toUpperCase()) {
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
		case "TINYINT":
		case "SMALLINT":
		case "MEDIUMINT":
		case "INT":
		case "INTEGER":
		case "SERIAL":
		case "INT2":
			return ColumnTypeEnum.Int32;
		case "BIGINT":
		case "UNSIGNED BIG INT":
		case "INT8":
			return ColumnTypeEnum.Int64;
		case "DATETIME":
		case "TIMESTAMP":
			return ColumnTypeEnum.DateTime;
		case "TIME":
			return ColumnTypeEnum.Time;
		case "DATE":
			return ColumnTypeEnum.Date;
		case "TEXT":
		case "CLOB":
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
		case "JSONB":
			return ColumnTypeEnum.Json;
		default:
			return null;
	}
}

/**
 * Infers column type from a value when declared type is not available
 */
function inferColumnType(value: unknown): ColumnType {
	switch (typeof value) {
		case "string":
			return ColumnTypeEnum.Text;
		case "bigint":
			return ColumnTypeEnum.Int64;
		case "boolean":
			return ColumnTypeEnum.Boolean;
		case "number":
			return ColumnTypeEnum.UnknownNumber;
		case "object":
			if (value instanceof ArrayBuffer || value instanceof Uint8Array || Buffer.isBuffer(value)) {
				return ColumnTypeEnum.Bytes;
			}
			return ColumnTypeEnum.Text;
		default:
			return ColumnTypeEnum.UnknownNumber;
	}
}

/**
 * Gets column types array from declarations, inferring from data when needed
 */
function getColumnTypes(declaredTypes: string[], rows: unknown[][]): ColumnType[] {
	const columnTypes: ColumnType[] = [];
	const emptyIndices: number[] = [];

	// Map declared types
	for (let i = 0; i < declaredTypes.length; i++) {
		const declType = declaredTypes[i];
		const mappedType = declType ? mapDeclType(declType) : null;
		if (mappedType === null) {
			emptyIndices.push(i);
			columnTypes[i] = ColumnTypeEnum.Int32; // Default
		} else {
			columnTypes[i] = mappedType;
		}
	}

	// Infer types for columns with no declared type
	for (const columnIndex of emptyIndices) {
		for (const row of rows) {
			const value = row[columnIndex];
			if (value !== null) {
				columnTypes[columnIndex] = inferColumnType(value);
				break;
			}
		}
	}

	return columnTypes;
}

/**
 * Maps a row of values from SQLite format to Prisma format
 */
function mapRow(row: unknown[], columnTypes: ColumnType[]): unknown[] {
	const result: unknown[] = [];

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

		// Handle BLOB/Bytes that come as base64 string from bun:sqlite
		// Only decode base64 if the column type is explicitly Bytes
		if (typeof value === "string" && columnTypes[i] === ColumnTypeEnum.Bytes) {
			try {
				// Decode as base64
				const buffer = Buffer.from(value, "base64");
				result[i] = Array.from(buffer);
				continue;
			} catch {
				// If not base64, treat as regular string
			}
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
function mapArg(arg: unknown, argType: ArgType, options?: PrismaBunSqlite3Options): unknown {
	if (arg === null) {
		return null;
	}

	// Parse string numbers to proper types
	if (typeof arg === "string" && argType.scalarType === "int") {
		return Number.parseInt(arg);
	}

	if (typeof arg === "string" && argType.scalarType === "float") {
		return Number.parseFloat(arg);
	}

	if (typeof arg === "string" && argType.scalarType === "decimal") {
		// This can lose precision, but SQLite does not have a native decimal type
		return Number.parseFloat(arg);
	}

	if (typeof arg === "string" && argType.scalarType === "bigint") {
		return BigInt(arg);
	}

	// SQLite does not natively support booleans - convert to 1/0
	if (typeof arg === "boolean") {
		return arg ? 1 : 0;
	}

	// Handle DateTime arguments
	if (typeof arg === "string" && argType.scalarType === "datetime") {
		arg = new Date(arg);
	}

	if (arg instanceof Date) {
		const format = options?.timestampFormat ?? "iso8601";
		switch (format) {
			case "unixepoch-ms":
				return arg.getTime();
			case "iso8601":
				return arg.toISOString().replace("Z", "+00:00");
			default:
				throw new Error(`Unknown timestamp format: ${format}`);
		}
	}

	// Handle Bytes arguments
	if (typeof arg === "string" && argType.scalarType === "bytes") {
		return Buffer.from(arg, "base64");
	}

	if (Array.isArray(arg) && argType.scalarType === "bytes") {
		return Buffer.from(arg);
	}

	return arg;
}

/**
 * Converts SQLite errors to Prisma error format
 * Matches the official Prisma better-sqlite3 adapter error handling
 */
function convertDriverError(error: any): any {
	// Only handle errors with code and message properties
	if (typeof error?.code !== "string" || typeof error?.message !== "string") {
		throw error;
	}

	const message = error.message;
	const code = error.code;

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

			// Unrecognized error - rethrow
			throw error;
	}
}

/**
 * Base queryable class for both adapter and transactions
 */
class BunSQLiteQueryable {
	constructor(
		protected db: Database,
		protected adapterOptions?: PrismaBunSqlite3Options,
	) {}

	readonly provider = "sqlite" as const;
	readonly adapterName = ADAPTER_NAME;

	/**
	 * Execute a query and return the result set
	 */
	async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
		try {
			// Map arguments from Prisma format to SQLite format
			const args = query.args.map((arg, i) => {
				const argType = query.argTypes[i];
				return argType ? mapArg(arg, argType, this.adapterOptions) : arg;
			});

			// Prepare statement with parameters
			const stmt = this.db.prepare(query.sql);

			// Get column metadata from statement (works even with 0 rows)
			const columnNames = (stmt as any).columnNames || [];
			const declaredTypes = (stmt as any).declaredTypes || [];

			// Execute query and get all rows
			const rows = stmt.all(...(args as any)) as any[];

			// Convert rows from objects to arrays for type inference
			const rowArrays = rows.map((row) => columnNames.map((col: string) => row[col]));

			// Get column types using inference for computed columns
			// This handles cases where declaredTypes is empty (COUNT, expressions, etc.)
			const columnTypes = getColumnTypes(declaredTypes, rowArrays);

			// If no results, return empty set with column metadata
			if (!rows || rows.length === 0) {
				return {
					columnNames,
					columnTypes,
					rows: [],
				};
			}

			// Map rows to Prisma format
			const mappedRows = rowArrays.map((rowArray) => mapRow(rowArray, columnTypes));

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
		try {
			// Map arguments from Prisma format to SQLite format
			const args = query.args.map((arg, i) => {
				const argType = query.argTypes[i];
				return argType ? mapArg(arg, argType, this.adapterOptions) : arg;
			});

			const stmt = this.db.prepare(query.sql);
			const result = stmt.run(...(args as any));
			return result.changes;
		} catch (error: any) {
			throw new DriverAdapterError(convertDriverError(error));
		}
	}

	/**
	 * Get column types for a query result
	 */
	private getColumnTypesForQuery(sql: string, columnNames: string[], rows: any[]): ColumnType[] {
		// Build a type map from all tables that might be mentioned in the query
		const typeMap = new Map<string, string>();

		// Extract all possible table names from the SQL
		// Match: FROM table, JOIN table, INSERT INTO table, UPDATE table
		// Handle backticks, quotes, and schema-qualified names like `main`.`User`
		const tablePattern = /(?:FROM|JOIN|INTO|UPDATE)\s+(?:`?\w+`?\.)?[`"']?(\w+)[`"']?/gi;
		const tables = new Set<string>();

		let match;
		while ((match = tablePattern.exec(sql)) !== null) {
			if (match[1]) {
				tables.add(match[1]);
			}
		}

		// Get schema info from all mentioned tables
		for (const tableName of tables) {
			try {
				const schema = this.db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
				for (const col of schema) {
					// Don't overwrite if already exists (prefer first table's columns)
					if (!typeMap.has(col.name)) {
						typeMap.set(col.name, col.type);
					}
				}
			} catch {
				// Ignore errors for invalid table names
			}
		}

		// If we found type mappings, use them
		if (typeMap.size > 0) {
			const declaredTypes = columnNames.map((name) => typeMap.get(name) || "");
			return getColumnTypes(declaredTypes, rows.map((row) => columnNames.map((col) => row[col])));
		}

		// Fallback: infer types from data
		const rowArrays = rows.map((row) => columnNames.map((col) => row[col]));
		return getColumnTypes(columnNames.map(() => ""), rowArrays);
	}
}

/**
 * Transaction implementation
 */
class BunSQLiteTransaction extends BunSQLiteQueryable implements Transaction {
	constructor(
		db: Database,
		readonly options: TransactionOptions,
		adapterOptions: PrismaBunSqlite3Options | undefined,
		private onComplete: () => void,
	) {
		super(db, adapterOptions);
	}

	async commit(): Promise<void> {
		try {
			this.db.run("COMMIT");
		} finally {
			this.onComplete();
		}
	}

	async rollback(): Promise<void> {
		try {
			this.db.run("ROLLBACK");
		} catch (error) {
			// Ignore rollback errors
		} finally {
			this.onComplete();
		}
	}
}

/**
 * Simple async mutex for serializing operations
 * Ensures only one transaction runs at a time
 */
class AsyncMutex {
	private locked = false;
	private queue: Array<() => void> = [];

	async acquire(): Promise<() => void> {
		// If not locked, acquire immediately
		if (!this.locked) {
			this.locked = true;
			return () => this.release();
		}

		// Otherwise, wait in queue
		return new Promise<() => void>((resolve) => {
			this.queue.push(() => {
				this.locked = true;
				resolve(() => this.release());
			});
		});
	}

	private release(): void {
		const next = this.queue.shift();
		if (next) {
			// Give next waiter the lock
			next();
		} else {
			// No waiters, unlock
			this.locked = false;
		}
	}
}

/**
 * Main BunSQLite adapter class
 */
export class BunSQLiteAdapter extends BunSQLiteQueryable implements SqlDriverAdapter {
	private transactionMutex = new AsyncMutex();

	constructor(db: Database, adapterOptions?: PrismaBunSqlite3Options) {
		super(db, adapterOptions);
	}

	/**
	 * Execute multiple SQL statements (for migrations)
	 */
	async executeScript(script: string): Promise<void> {
		try {
			// Use native exec() which properly handles multiple statements
			this.db.exec(script);
		} catch (error: any) {
			throw new DriverAdapterError(convertDriverError(error));
		}
	}

	/**
	 * Start a new transaction
	 * Transactions are automatically serialized via mutex - concurrent calls will wait
	 */
	async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
		// SQLite only supports SERIALIZABLE isolation level
		if (isolationLevel && isolationLevel !== "SERIALIZABLE") {
			throw new DriverAdapterError({
				kind: "InvalidIsolationLevel",
				level: isolationLevel,
			});
		}

		// Acquire mutex lock - this will wait if another transaction is active
		const releaseLock = await this.transactionMutex.acquire();

		try {
			// Begin transaction
			this.db.run("BEGIN DEFERRED");

			const options: TransactionOptions = {
				usePhantomQuery: true,
			};

			const onComplete = () => {
				// Release lock when transaction completes (commit or rollback)
				releaseLock();
			};

			return new BunSQLiteTransaction(this.db, options, this.adapterOptions, onComplete);
		} catch (error: any) {
			// Release lock on error
			releaseLock();
			throw new DriverAdapterError(convertDriverError(error));
		}
	}

	/**
	 * Dispose of the adapter and close the database
	 */
	async dispose(): Promise<void> {
		this.db.close();
	}

	/**
	 * Get connection info (optional)
	 */
	getConnectionInfo() {
		return {
			maxBindValues: 999, // SQLite default limit
			supportsRelationJoins: true,
		};
	}
}

/**
 * Factory function to create a BunSQLite adapter
 */
export function createBunSQLiteAdapter(db: Database): SqlDriverAdapter {
	return new BunSQLiteAdapter(db);
}

/**
 * Configuration options for BunSQLite adapter
 */
export type PrismaBunSQLiteConfig = {
	/**
	 * Database URL (file path or :memory:)
	 * Examples: "file:./dev.db", "file:/absolute/path/db.sqlite", ":memory:"
	 */
	url: string;
} & PrismaBunSqlite3Options;

/**
 * BunSQLite adapter factory for Prisma Client
 */
export class PrismaBunSQLite {
	readonly provider = "sqlite" as const;
	readonly adapterName = ADAPTER_NAME;

	private config: PrismaBunSQLiteConfig;

	constructor(config: PrismaBunSQLiteConfig) {
		this.config = config;
	}

	async connect(): Promise<SqlDriverAdapter> {
		// Parse URL - support both "file:./path" and "./path" formats
		const dbPath = this.config.url.replace(/^file:/, "");

		// Enable safe integers by default to prevent precision loss for BIGINT values
		const safeIntegers = this.config.safeIntegers !== false;
		const db = new Database(dbPath, { safeIntegers });

		// Enable foreign key constraints (required for cascading deletes)
		db.run("PRAGMA foreign_keys = ON");

		// Set busy timeout to handle locked database (5 seconds)
		db.run("PRAGMA busy_timeout = 5000");

		// Enable WAL mode for better concurrency and performance
		db.run("PRAGMA journal_mode = WAL");

		return new BunSQLiteAdapter(db, this.config);
	}
}
