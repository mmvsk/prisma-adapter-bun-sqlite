/**
 * Type definitions for prisma-adapter-bun-sqlite
 */

/**
 * WAL (Write-Ahead Logging) mode configuration for SQLite.
 * Only applies to file-based databases (:memory: databases don't support WAL).
 *
 * @example
 * ```typescript
 * const adapter = new PrismaBunSqlite({
 *   url: "file:./dev.db",
 *   wal: {
 *     enabled: true,
 *     synchronous: "NORMAL",  // 2-3x faster than FULL
 *     walAutocheckpoint: 2000,
 *     busyTimeout: 10000
 *   }
 * });
 * ```
 *
 * @see https://www.sqlite.org/wal.html
 */
export type WalConfiguration = {
	/**
	 * Enable or disable WAL mode.
	 * @default false
	 */
	enabled: boolean;

	/**
	 * Synchronous mode for WAL - controls durability vs performance trade-off.
	 * - `OFF`: No fsync at all (fastest, least safe)
	 * - `NORMAL`: Fsync only at checkpoints (2-3x faster than FULL, recommended for most cases)
	 * - `FULL`: Fsync after every write (safest, slowest)
	 * - `EXTRA`: Extra durability checks
	 *
	 * @default undefined (SQLite default, usually FULL)
	 * @see https://www.sqlite.org/pragma.html#pragma_synchronous
	 */
	synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";

	/**
	 * Number of pages before automatic WAL checkpoint.
	 * - Lower values = more frequent checkpoints = slower writes but smaller WAL files
	 * - Higher values = fewer checkpoints = faster writes but larger WAL files
	 *
	 * @default undefined (SQLite default, usually 1000)
	 * @see https://www.sqlite.org/pragma.html#pragma_wal_autocheckpoint
	 */
	walAutocheckpoint?: number;

	/**
	 * Busy timeout in milliseconds - how long to wait when database is locked.
	 *
	 * @default undefined (will use 5000ms if not specified)
	 * @see https://www.sqlite.org/pragma.html#pragma_busy_timeout
	 */
	busyTimeout?: number;
};

/**
 * Runtime options for BunSqlite adapter.
 * These options control how data is converted between SQLite and Prisma formats.
 *
 * @example
 * ```typescript
 * const adapter = new PrismaBunSqlite({
 *   url: "file:./dev.db",
 *   timestampFormat: "iso8601",  // or "unixepoch-ms"
 *   safeIntegers: true,           // prevent precision loss for BIGINT
 *   wal: true                     // enable WAL mode
 * });
 * ```
 */
export type PrismaBunSqliteOptions = {
	/**
	 * How to format DateTime values in the database.
	 * - `iso8601`: Stores as ISO 8601 strings (human-readable, default, recommended)
	 * - `unixepoch-ms`: Stores as Unix timestamps in milliseconds (more efficient)
	 *
	 * @default "iso8601"
	 */
	timestampFormat?: "iso8601" | "unixepoch-ms";

	/**
	 * Enable safe 64-bit integer handling.
	 * When `true`, BIGINT columns return as `BigInt` instead of `number`,
	 * preventing precision loss for values > `Number.MAX_SAFE_INTEGER` (2^53-1).
	 *
	 * @default true
	 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
	 */
	safeIntegers?: boolean;

	/**
	 * WAL (Write-Ahead Logging) configuration.
	 * - `true`: Enable WAL with default settings
	 * - `WalConfiguration`: Enable WAL with custom settings
	 * - `undefined`: WAL disabled (default)
	 *
	 * Only applies to file-based databases (:memory: databases ignore this).
	 *
	 * @default undefined (WAL disabled)
	 * @see WalConfiguration
	 */
	wal?: boolean | WalConfiguration;
};

/**
 * Configuration options for PrismaBunSqlite adapter factory.
 * Combines database connection settings with runtime options.
 *
 * @example
 * ```typescript
 * const adapter = new PrismaBunSqlite({
 *   url: "file:./dev.db",
 *   shadowDatabaseUrl: ":memory:",
 *   timestampFormat: "iso8601",
 *   safeIntegers: true,
 *   wal: true
 * });
 * ```
 */
export type PrismaBunSqliteConfig = {
	/**
	 * Database URL - file path or `:memory:` for in-memory database.
	 *
	 * @example
	 * - `"file:./dev.db"` - Relative path
	 * - `"file:/absolute/path/db.sqlite"` - Absolute path
	 * - `":memory:"` - In-memory database
	 */
	url: string;

	/**
	 * Shadow database URL for migrations (optional).
	 * Used by Prisma Migrate for migration testing and diffing.
	 * Defaults to `:memory:` if not specified for maximum speed.
	 *
	 * @default ":memory:"
	 * @example
	 * - `"file:./shadow.db"` - File-based shadow database
	 * - `":memory:"` - In-memory shadow database (faster)
	 */
	shadowDatabaseUrl?: string;
} & PrismaBunSqliteOptions;

/**
 * Transaction state for defensive programming
 * Prevents queries on closed transactions and provides clear error messages
 */
export type TransactionState = "active" | "committed" | "rolled_back";
