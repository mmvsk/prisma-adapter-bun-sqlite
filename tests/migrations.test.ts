/**
 * Tests for programmatic migration utilities (v0.2.0)
 */

import { test, expect, describe } from "bun:test";
import { PrismaBunSqlite } from "../src/adapter";
import {
	runMigrations,
	getAppliedMigrations,
	getPendingMigrations,
	createTestDatabase,
	type Migration,
} from "../src/migrations";

describe("Migration Utilities", () => {
	test("runMigrations applies migrations to database", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_init",
				sql: `
					CREATE TABLE users (
						id INTEGER PRIMARY KEY,
						email TEXT NOT NULL UNIQUE
					);
				`,
			},
			{
				name: "002_add_posts",
				sql: `
					CREATE TABLE posts (
						id INTEGER PRIMARY KEY,
						title TEXT NOT NULL,
						userId INTEGER NOT NULL,
						FOREIGN KEY (userId) REFERENCES users(id)
					);
				`,
			},
		];

		// Apply migrations
		const logs: string[] = [];
		await runMigrations(adapter, migrations, {
			logger: (msg) => logs.push(msg),
		});

		// Should have logged both migrations (start + completion = 4 messages)
		expect(logs.length).toBe(4);
		expect(logs.some((log) => log.includes("001_init"))).toBe(true);
		expect(logs.some((log) => log.includes("002_add_posts"))).toBe(true);

		// Verify tables exist
		const result = await adapter.queryRaw({
			sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
			args: [],
			argTypes: [],
		});

		const tableNames = result.rows.map((row) => row[0]);
		expect(tableNames).toContain("users");
		expect(tableNames).toContain("posts");

		await adapter.dispose();
	});

	test("runMigrations skips already applied migrations", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_init",
				sql: "CREATE TABLE test (id INTEGER PRIMARY KEY);",
			},
		];

		// Apply migrations first time
		await runMigrations(adapter, migrations, { logger: () => {} });

		// Apply again - should skip
		const logs: string[] = [];
		await runMigrations(adapter, migrations, {
			logger: (msg) => logs.push(msg),
		});

		// Should have skipped
		expect(logs.length).toBe(1);
		expect(logs[0]).toContain("already applied");

		await adapter.dispose();
	});

	test("runMigrations tracks migrations in _prisma_migrations table", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_test",
				sql: "CREATE TABLE test (id INTEGER);",
			},
		];

		await runMigrations(adapter, migrations, { logger: () => {} });

		// Check migration tracking table
		const result = await adapter.queryRaw({
			sql: "SELECT migration_name, applied_steps_count FROM _prisma_migrations",
			args: [],
			argTypes: [],
		});

		expect(result.rows.length).toBe(1);
		expect(result.rows[0]![0]!).toBe("001_test");
		expect(result.rows[0]![1]!).toBe("1");

		await adapter.dispose();
	});

	test("runMigrations throws error on SQL failure", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_bad",
				sql: "INVALID SQL SYNTAX HERE;",
			},
		];

		// Should throw
		try {
			await runMigrations(adapter, migrations, { logger: () => {} });
			expect(true).toBe(false); // Should not reach
		} catch (error: any) {
			expect(error).toBeDefined();
		}

		await adapter.dispose();
	});

	test("getAppliedMigrations returns list of applied migrations", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		// Initially empty
		let applied = await getAppliedMigrations(adapter);
		expect(applied).toEqual([]);

		// Apply some migrations
		await runMigrations(
			adapter,
			[
				{ name: "001_first", sql: "CREATE TABLE t1 (id INTEGER);" },
				{ name: "002_second", sql: "CREATE TABLE t2 (id INTEGER);" },
			],
			{ logger: () => {} },
		);

		// Should return both
		applied = await getAppliedMigrations(adapter);
		expect(applied).toEqual(["001_first", "002_second"]);

		await adapter.dispose();
	});

	test("getPendingMigrations returns unapplied migrations", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const allMigrations: Migration[] = [
			{ name: "001_first", sql: "CREATE TABLE t1 (id INTEGER);" },
			{ name: "002_second", sql: "CREATE TABLE t2 (id INTEGER);" },
			{ name: "003_third", sql: "CREATE TABLE t3 (id INTEGER);" },
		];

		// Apply first two
		await runMigrations(adapter, allMigrations.slice(0, 2), {
			logger: () => {},
		});

		// Check pending
		const pending = await getPendingMigrations(adapter, allMigrations);
		expect(pending).toEqual(["003_third"]);

		await adapter.dispose();
	});

	test("createTestDatabase creates :memory: database with migrations", async () => {
		const migrations: Migration[] = [
			{
				name: "001_users",
				sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
			},
		];

		const adapter = await createTestDatabase(migrations);

		// Verify table exists
		const result = await adapter.queryRaw({
			sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
			args: [],
			argTypes: [],
		});

		expect(result.rows.length).toBe(1);

		await adapter.dispose();
	});

	test("createTestDatabase with safeIntegers config", async () => {
		const migrations: Migration[] = [
			{
				name: "001_bigints",
				sql: `
					CREATE TABLE bigints (id INTEGER PRIMARY KEY, value INTEGER);
					INSERT INTO bigints (id, value) VALUES (1, 9223372036854775807);
				`,
			},
		];

		const adapter = await createTestDatabase(migrations, {
			safeIntegers: true,
		});

		// Query should return BigInt as string
		const result = await adapter.queryRaw({
			sql: "SELECT value FROM bigints WHERE id = 1",
			args: [],
			argTypes: [],
		});

		expect(result.rows[0]![0]!).toBe("9223372036854775807");

		await adapter.dispose();
	});

	test("migrations work with complex SQL including comments", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_complex",
				sql: `
					-- Create users table
					CREATE TABLE users (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						email TEXT NOT NULL UNIQUE,
						created_at DATETIME DEFAULT CURRENT_TIMESTAMP
					);

					-- Create index
					CREATE INDEX idx_users_email ON users(email);

					-- Insert test data
					INSERT INTO users (email) VALUES ('test@example.com');
				`,
			},
		];

		await runMigrations(adapter, migrations, { logger: () => {} });

		// Verify data inserted
		const result = await adapter.queryRaw({
			sql: "SELECT email FROM users",
			args: [],
			argTypes: [],
		});

		expect(result.rows).toEqual([["test@example.com"]]);

		await adapter.dispose();
	});

	test("multiple migration runs are idempotent", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_test",
				sql: "CREATE TABLE test (id INTEGER);",
			},
		];

		// Run three times
		await runMigrations(adapter, migrations, { logger: () => {} });
		await runMigrations(adapter, migrations, { logger: () => {} });
		await runMigrations(adapter, migrations, { logger: () => {} });

		// Should only have one entry in tracking table
		const applied = await getAppliedMigrations(adapter);
		expect(applied).toEqual(["001_test"]);

		await adapter.dispose();
	});

	test("migrations preserve foreign key constraints", async () => {
		const factory = new PrismaBunSqlite({ url: ":memory:" });
		const adapter = await factory.connect();

		const migrations: Migration[] = [
			{
				name: "001_tables",
				sql: `
					CREATE TABLE users (id INTEGER PRIMARY KEY);
					CREATE TABLE posts (
						id INTEGER PRIMARY KEY,
						userId INTEGER NOT NULL,
						FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
					);
					INSERT INTO users (id) VALUES (1);
					INSERT INTO posts (id, userId) VALUES (1, 1);
				`,
			},
		];

		await runMigrations(adapter, migrations, { logger: () => {} });

		// Verify foreign key works - deleting user should cascade
		await adapter.executeScript("DELETE FROM users WHERE id = 1");

		const result = await adapter.queryRaw({
			sql: "SELECT COUNT(*) FROM posts",
			args: [],
			argTypes: [],
		});

		// Post should be deleted due to CASCADE
		expect(result.rows[0]![0]!).toBe("0");

		await adapter.dispose();
	});
});
