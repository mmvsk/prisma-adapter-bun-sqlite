/**
 * Migration helper utilities for programmatic migration execution
 *
 * Allows running Prisma migrations directly from TypeScript, enabling:
 * - :memory: database testing with real migrations
 * - Embedded migrations in standalone binaries
 * - Custom migration workflows
 *
 * @example
 * ```typescript
 * import { runMigrations } from "prisma-adapter-bun-sqlite/migrations";
 * import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
 *
 * const adapter = await new PrismaBunSqlite({ url: ":memory:" }).connect();
 * await runMigrations(adapter, [
 *   { name: "init", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY);" }
 * ]);
 * ```
 */

import type { SqlDriverAdapter } from "@prisma/driver-adapter-utils";

/**
 * A migration to apply
 */
export interface Migration {
	/** Migration name (e.g., "20241120_init" or "001_create_users") */
	name: string;
	/** SQL statements to execute */
	sql: string;
}

/**
 * Options for migration execution
 */
export interface MigrationOptions {
	/**
	 * Whether to skip migrations that have already been applied
	 * @default true
	 */
	skipApplied?: boolean;
	/**
	 * Custom logger function
	 * @default console.log
	 */
	logger?: (message: string) => void;
	/**
	 * Whether to wrap all migrations in a transaction
	 * Note: SQLite DDL statements cause implicit commits, so this is mostly
	 * useful for migration tracking consistency
	 * @default false
	 */
	useTransaction?: boolean;
}

/**
 * Migration tracking table (Prisma-compatible format)
 */
const MIGRATION_TABLE_SQL = `
	CREATE TABLE IF NOT EXISTS _prisma_migrations (
		id TEXT PRIMARY KEY,
		checksum TEXT NOT NULL,
		finished_at DATETIME,
		migration_name TEXT NOT NULL,
		logs TEXT,
		rolled_back_at DATETIME,
		started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		applied_steps_count INTEGER DEFAULT 0
	);
`;

/**
 * Run migrations against a database adapter
 *
 * @param adapter - The database adapter to run migrations against
 * @param migrations - Array of migrations to apply
 * @param options - Migration options
 *
 * @example Basic usage
 * ```typescript
 * const adapter = await new PrismaBunSqlite({ url: ":memory:" }).connect();
 *
 * await runMigrations(adapter, [
 *   {
 *     name: "001_init",
 *     sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE);"
 *   },
 *   {
 *     name: "002_add_posts",
 *     sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, userId INTEGER);"
 *   }
 * ]);
 * ```
 *
 * @example With custom options
 * ```typescript
 * await runMigrations(adapter, migrations, {
 *   logger: (msg) => console.error(`[MIGRATION] ${msg}`),
 *   skipApplied: true
 * });
 * ```
 */
export async function runMigrations(
	adapter: SqlDriverAdapter,
	migrations: Migration[],
	options: MigrationOptions = {},
): Promise<void> {
	const { skipApplied = true, logger = console.log } = options;

	// Create migration tracking table
	await adapter.executeScript(MIGRATION_TABLE_SQL);

	// Get database instance to query applied migrations
	const db = (adapter as any).db;
	if (!db) {
		throw new Error("Cannot access underlying database from adapter");
	}

	for (const migration of migrations) {
		// Check if already applied
		if (skipApplied) {
			const applied = db
				.prepare("SELECT id FROM _prisma_migrations WHERE migration_name = ?")
				.get(migration.name);

			if (applied) {
				logger(`⏭️  ${migration.name} (already applied)`);
				continue;
			}
		}

		logger(`▶️  ${migration.name}...`);

		try {
			const startTime = Date.now();

			// Apply migration
			await adapter.executeScript(migration.sql);

			// Record migration
			const id = crypto.randomUUID();
			const checksum = await generateChecksum(migration.sql);
			const now = new Date().toISOString();

			db.prepare(`
				INSERT INTO _prisma_migrations (
					id, checksum, migration_name, finished_at, applied_steps_count
				) VALUES (?, ?, ?, ?, ?)
			`).run(id, checksum, migration.name, now, 1);

			const duration = Date.now() - startTime;
			logger(`✅ ${migration.name} (${duration}ms)`);
		} catch (error: any) {
			logger(`❌ ${migration.name} failed: ${error.message}`);
			throw error;
		}
	}
}

/**
 * Load migrations from a directory (for use with Bun's file system)
 *
 * Reads migration files from a directory structure like:
 * ```
 * migrations/
 *   20241120_init/
 *     migration.sql
 *   20241121_add_users/
 *     migration.sql
 * ```
 *
 * @param migrationsDir - Path to migrations directory
 * @returns Array of migrations
 *
 * @example
 * ```typescript
 * import { loadMigrationsFromDir } from "prisma-adapter-bun-sqlite/migrations";
 *
 * const migrations = await loadMigrationsFromDir("./prisma/migrations");
 * await runMigrations(adapter, migrations);
 * ```
 */
export async function loadMigrationsFromDir(
	migrationsDir: string,
): Promise<Migration[]> {
	const { readdirSync, existsSync } = await import("node:fs");
	const { join } = await import("node:path");

	if (!existsSync(migrationsDir)) {
		return [];
	}

	const entries = readdirSync(migrationsDir, { withFileTypes: true });
	const migrations: Migration[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith("_")) continue; // Skip special folders like _baseline

		const migrationFile = join(migrationsDir, entry.name, "migration.sql");

		try {
			const sql = await Bun.file(migrationFile).text();
			migrations.push({
				name: entry.name,
				sql,
			});
		} catch {
			// Skip if migration.sql doesn't exist
			continue;
		}
	}

	// Sort by name (assumes timestamp-based naming)
	return migrations.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get list of applied migrations
 *
 * @param adapter - The database adapter
 * @returns Array of applied migration names
 *
 * @example
 * ```typescript
 * const applied = await getAppliedMigrations(adapter);
 * console.log("Applied migrations:", applied);
 * ```
 */
export async function getAppliedMigrations(
	adapter: SqlDriverAdapter,
): Promise<string[]> {
	const db = (adapter as any).db;
	if (!db) {
		throw new Error("Cannot access underlying database from adapter");
	}

	// Check if migration table exists
	const tableExists = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'",
		)
		.get();

	if (!tableExists) {
		return [];
	}

	// Get all applied migrations
	const rows = db
		.prepare(
			"SELECT migration_name FROM _prisma_migrations ORDER BY started_at",
		)
		.all() as Array<{ migration_name: string }>;

	return rows.map((row) => row.migration_name);
}

/**
 * Check if migrations need to be applied
 *
 * @param adapter - The database adapter
 * @param migrations - Migrations to check
 * @returns Array of pending migration names
 *
 * @example
 * ```typescript
 * const pending = await getPendingMigrations(adapter, allMigrations);
 * if (pending.length > 0) {
 *   console.log(`${pending.length} migrations need to be applied`);
 * }
 * ```
 */
export async function getPendingMigrations(
	adapter: SqlDriverAdapter,
	migrations: Migration[],
): Promise<string[]> {
	const applied = await getAppliedMigrations(adapter);
	const appliedSet = new Set(applied);

	return migrations
		.filter((migration) => !appliedSet.has(migration.name))
		.map((migration) => migration.name);
}

/**
 * Generate checksum for migration SQL
 * Simple implementation using Bun's hash
 */
async function generateChecksum(sql: string): Promise<string> {
	const hash = Bun.hash(sql);
	return hash.toString(16);
}

/**
 * Create a test database with migrations applied
 *
 * Convenience function for testing with :memory: databases
 *
 * @param migrations - Migrations to apply
 * @param config - Optional adapter configuration
 * @returns Configured adapter with migrations applied
 *
 * @example
 * ```typescript
 * import { createTestDatabase } from "prisma-adapter-bun-sqlite/migrations";
 * import { PrismaClient } from "@prisma/client";
 *
 * const adapter = await createTestDatabase([
 *   { name: "init", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY);" }
 * ]);
 *
 * const prisma = new PrismaClient({ adapter });
 * await prisma.user.create({ data: { ... } });
 * ```
 */
export async function createTestDatabase(
	migrations: Migration[],
	config?: { safeIntegers?: boolean; timestampFormat?: "iso8601" | "unixepoch-ms" },
): Promise<SqlDriverAdapter> {
	const { PrismaBunSqlite } = await import("./adapter");

	const factory = new PrismaBunSqlite({
		url: ":memory:",
		...config,
	});

	const adapter = await factory.connect();

	// Apply migrations
	await runMigrations(adapter, migrations, {
		logger: () => {}, // Silent for tests
	});

	return adapter;
}
