import { Database } from "bun:sqlite";
import {
	ColumnTypeEnum,
	type ArgType,
	type ColumnType,
	DriverAdapterError,
	type IsolationLevel,
	type SqlDriverAdapter,
	type SqlMigrationAwareDriverAdapterFactory,
	type SqlQuery,
	type SqlResultSet,
	type Transaction,
	type TransactionOptions,
} from "@prisma/driver-adapter-utils";

const ADAPTER_NAME = "prisma-adapter-bun-sqlite";

/**
 * WAL (Write-Ahead Logging) mode configuration for SQLite
 * Only applies to file-based databases (:memory: databases don't support WAL)
 */
export type WalConfiguration = {
	/**
	 * Enable or disable WAL mode
	 * @default false
	 */
	enabled: boolean;
	/**
	 * Synchronous mode for WAL
	 * - OFF: No fsync at all (fastest, least safe)
	 * - NORMAL: Fsync only at checkpoints (2-3x faster than FULL)
	 * - FULL: Fsync after every write (safest, slowest)
	 * - EXTRA: Extra durability checks
	 * @default undefined (SQLite default, usually FULL)
	 */
	synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
	/**
	 * Number of pages before automatic WAL checkpoint
	 * Lower values = more frequent checkpoints = slower writes but smaller WAL files
	 * Higher values = fewer checkpoints = faster writes but larger WAL files
	 * @default undefined (SQLite default, usually 1000)
	 */
	walAutocheckpoint?: number;
	/**
	 * Busy timeout in milliseconds
	 * How long to wait when database is locked
	 * @default undefined (will use 5000ms if not specified)
	 */
	busyTimeout?: number;
};

/**
 * Runtime options for BunSqlite adapter
 * These options control how data is converted between SQLite and Prisma formats
 */
export type PrismaBunSqliteOptions = {
	/**
	 * How to format DateTime values in the database
	 * @default "iso8601"
	 */
	timestampFormat?: "iso8601" | "unixepoch-ms";
	/**
	 * Enable safe 64-bit integer handling.
	 * When true, BIGINT columns return as BigInt instead of number,
	 * preventing precision loss for values > Number.MAX_SAFE_INTEGER.
	 * @default true
	 */
	safeIntegers?: boolean;
	/**
	 * WAL (Write-Ahead Logging) configuration
	 * Can be boolean (true = enable with defaults) or detailed config object
	 * Only applies to file-based databases (:memory: ignores this)
	 * @default undefined (WAL disabled)
	 */
	wal?: boolean | WalConfiguration;
};

/**
 * Maps SQLite column type declarations to Prisma ColumnType enum
 * Handles type variants with length specifiers (e.g., VARCHAR(255))
 * and UNSIGNED modifiers (e.g., INTEGER UNSIGNED)
 */
function mapDeclType(declType: string): ColumnType | null {
	// Normalize: uppercase, trim, and remove length specifiers like (255)
	const normalized = declType.toUpperCase().trim();
	const baseType = normalized.replace(/\([^)]*\)/g, "").trim();

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
function mapArg(arg: unknown, argType: ArgType, options?: PrismaBunSqliteOptions): unknown {
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
				const format = options?.timestampFormat ?? "iso8601";
				return format === "unixepoch-ms"
					? date.getTime()
					: date.toISOString().replace("Z", "+00:00");
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

/**
 * Maps SQLite errno values to code strings
 * Reference: https://www.sqlite.org/rescode.html
 */
const SQLITE_ERROR_MAP: Record<number, string> = {
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
function convertDriverError(error: any): any {
	// Bun SQLite errors have either .code (constraint violations) or .errno (other errors)
	if (!error?.message || (typeof error?.code !== "string" && typeof error?.errno !== "number")) {
		throw error;
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

			// Unrecognized error - rethrow
			throw error;
	}
}

/**
 * Base queryable class for both adapter and transactions
 */
class BunSqliteQueryable {
	constructor(
		protected db: Database,
		protected adapterOptions?: PrismaBunSqliteOptions,
	) {}

	readonly provider = "sqlite" as const;
	readonly adapterName = ADAPTER_NAME;

	/**
	 * Execute a query and return the result set
	 */
	async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
		try {
			// Fast path: if no special types need conversion, skip mapping
			const needsMapping = query.argTypes.some(
				(t) =>
					t &&
					(t.scalarType === "datetime" ||
						t.scalarType === "bytes" ||
						t.scalarType === "boolean")
			);

			// Map arguments from Prisma format to SQLite format
			const args = needsMapping
				? query.args.map((arg, i) => {
						const argType = query.argTypes[i];
						return argType ? mapArg(arg, argType, this.adapterOptions) : arg;
				  })
				: query.args;

			// Prepare statement with parameters
			const stmt = this.db.prepare(query.sql);

			// IMPORTANT: Use stmt.values() instead of stmt.all() to preserve column order
			// When queries have duplicate column names (e.g., SELECT u.id, p.id),
			// stmt.all() returns objects which lose duplicate keys, causing data corruption.
			// stmt.values() returns arrays preserving all columns in order.
			//
			// Note: Bun's columnNames also deduplicates, but we use values() which
			// returns the correct number of columns. We need to handle this carefully.
			const rowArrays = (stmt as any).values(...(args as any)) as unknown[][];

			// Get column metadata - note columnNames may be deduplicated by Bun
			// but the values arrays have the correct number of columns
			const columnNames = (stmt as any).columnNames || [];
			const declaredTypes = (stmt as any).declaredTypes || [];

			// Handle column count mismatch due to duplicate names
			// Only needed for queries with JOINs that have duplicate column names
			// Skip this expensive check for simple queries
			const firstRow = rowArrays[0];
			if (firstRow && firstRow.length > columnNames.length) {
				const actualColumnCount = firstRow.length;
				const missingCount = actualColumnCount - columnNames.length;

				// Pad columnNames and declaredTypes to match actual column count
				for (let i = 0; i < missingCount; i++) {
					columnNames.push(`column_${columnNames.length}`);
					declaredTypes.push(null);
				}
			}

			// Get column types using inference for computed columns
			// This handles cases where declaredTypes is empty (COUNT, expressions, etc.)
			const columnTypes = getColumnTypes(declaredTypes, rowArrays);

			// If no results, return empty set with column metadata
			if (!rowArrays || rowArrays.length === 0) {
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
			// Fast path: if no special types need conversion, skip mapping
			const needsMapping = query.argTypes.some(
				(t) =>
					t &&
					(t.scalarType === "datetime" ||
						t.scalarType === "bytes" ||
						t.scalarType === "boolean")
			);

			// Map arguments from Prisma format to SQLite format
			const args = needsMapping
				? query.args.map((arg, i) => {
						const argType = query.argTypes[i];
						return argType ? mapArg(arg, argType, this.adapterOptions) : arg;
				  })
				: query.args;

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
 *
 * With usePhantomQuery: false, the Prisma engine sends actual COMMIT/ROLLBACK
 * SQL statements through executeRaw(). These methods only release the mutex lock.
 *
 * This matches the official @prisma/adapter-better-sqlite3 implementation.
 */
class BunSqliteTransaction extends BunSqliteQueryable implements Transaction {
	constructor(
		db: Database,
		readonly options: TransactionOptions,
		adapterOptions: PrismaBunSqliteOptions | undefined,
		private releaseLock: () => void,
	) {
		super(db, adapterOptions);
	}

	async commit(): Promise<void> {
		// With usePhantomQuery: false, Prisma engine sends COMMIT via executeRaw
		// This method just releases the transaction lock
		this.releaseLock();
	}

	async rollback(): Promise<void> {
		// With usePhantomQuery: false, Prisma engine sends ROLLBACK via executeRaw
		// This method just releases the transaction lock
		this.releaseLock();
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
 * Main BunSqlite adapter class
 */
export class BunSqliteAdapter extends BunSqliteQueryable implements SqlDriverAdapter {
	private transactionMutex = new AsyncMutex();

	constructor(db: Database, adapterOptions?: PrismaBunSqliteOptions) {
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
	 *
	 * Uses usePhantomQuery: false (like official better-sqlite3 adapter)
	 * This means Prisma engine sends COMMIT/ROLLBACK through executeRaw()
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
			this.db.run("BEGIN");

			const options: TransactionOptions = {
				usePhantomQuery: false, // Match official better-sqlite3 adapter
			};

			return new BunSqliteTransaction(this.db, options, this.adapterOptions, releaseLock);
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
 * Factory function to create a BunSqlite adapter
 */
export function createBunSqliteAdapter(db: Database): SqlDriverAdapter {
	return new BunSqliteAdapter(db);
}

/**
 * Configuration options for BunSqlite adapter
 */
export type PrismaBunSqliteConfig = {
	/**
	 * Database URL (file path or :memory:)
	 * Examples: "file:./dev.db", "file:/absolute/path/db.sqlite", ":memory:"
	 */
	url: string;
	/**
	 * Shadow database URL for migrations (optional)
	 * Used by Prisma Migrate for migration testing and diffing.
	 * Defaults to ":memory:" if not specified.
	 * Examples: "file:./shadow.db", ":memory:"
	 */
	shadowDatabaseUrl?: string;
} & PrismaBunSqliteOptions;

/**
 * BunSqlite adapter factory for Prisma Client
 * Implements SqlMigrationAwareDriverAdapterFactory for shadow database support
 */
export class PrismaBunSqlite implements SqlMigrationAwareDriverAdapterFactory {
	readonly provider = "sqlite" as const;
	readonly adapterName = ADAPTER_NAME;

	private config: PrismaBunSqliteConfig;

	constructor(config: PrismaBunSqliteConfig) {
		this.config = config;
	}

	/**
	 * Create database connection with standard configuration
	 */
	private createConnection(url: string): Database {
		// Parse URL - support both "file:./path" and "./path" formats
		const dbPath = url.replace(/^file:/, "");

		// Enable safe integers by default to prevent precision loss for BIGINT values
		const safeIntegers = this.config.safeIntegers !== false;
		const db = new Database(dbPath, { safeIntegers });

		// Enable foreign key constraints (required for cascading deletes)
		db.run("PRAGMA foreign_keys = ON");

		// Configure WAL mode if specified (only for file-based databases)
		if (dbPath !== ":memory:") {
			this.configureWalMode(db);
		}

		return db;
	}

	/**
	 * Configure WAL (Write-Ahead Logging) mode
	 * Only applies to file-based databases
	 */
	private configureWalMode(db: Database): void {
		const walConfig = this.config.wal;

		// If wal not specified or explicitly disabled, skip WAL configuration
		if (!walConfig) {
			// Set default busy timeout even without WAL
			db.run("PRAGMA busy_timeout = 5000");
			return;
		}

		// Normalize config: boolean true -> {enabled: true}, object -> as-is
		const config: WalConfiguration =
			typeof walConfig === "boolean" ? { enabled: walConfig } : walConfig;

		// If explicitly disabled, skip
		if (!config.enabled) {
			// Set default busy timeout even without WAL
			db.run("PRAGMA busy_timeout = 5000");
			return;
		}

		// Enable WAL mode
		try {
			const result = db.prepare("PRAGMA journal_mode = WAL").get() as
				| { journal_mode: string }
				| undefined;
			const currentMode = result?.journal_mode?.toLowerCase();

			// Check if WAL was successfully enabled
			if (currentMode !== "wal") {
				throw new Error(`Failed to enable WAL mode. Current mode: ${currentMode || "unknown"}`);
			}
		} catch (error: any) {
			throw new DriverAdapterError({
				kind: "GenericJs",
				id: 0,
				originalMessage: `Failed to enable WAL mode: ${error.message}`,
			});
		}

		// Configure synchronous mode if specified
		if (config.synchronous) {
			db.run(`PRAGMA synchronous = ${config.synchronous}`);
		}

		// Configure WAL autocheckpoint if specified
		if (config.walAutocheckpoint !== undefined) {
			db.run(`PRAGMA wal_autocheckpoint = ${config.walAutocheckpoint}`);
		}

		// Configure busy timeout (use specified value or default 5000ms)
		const busyTimeout = config.busyTimeout ?? 5000;
		db.run(`PRAGMA busy_timeout = ${busyTimeout}`);
	}

	/**
	 * Connect to the main database
	 */
	async connect(): Promise<SqlDriverAdapter> {
		const db = this.createConnection(this.config.url);
		return new BunSqliteAdapter(db, this.config);
	}

	/**
	 * Connect to the shadow database for migrations
	 * Shadow database is used by Prisma Migrate for migration testing and diffing.
	 * Defaults to :memory: if shadowDatabaseUrl is not specified.
	 */
	async connectToShadowDb(): Promise<SqlDriverAdapter> {
		// Use :memory: by default for shadow database (faster and isolated)
		const shadowUrl = this.config.shadowDatabaseUrl ?? ":memory:";
		const db = this.createConnection(shadowUrl);
		return new BunSqliteAdapter(db, this.config);
	}
}
