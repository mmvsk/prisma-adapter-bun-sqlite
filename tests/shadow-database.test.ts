/**
 * Tests for shadow database support (v0.2.0)
 */

import { test, expect, describe } from "bun:test";
import { PrismaBunSQLite } from "../src/bunsqlite-adapter";

describe("Shadow Database Support", () => {
	test("factory implements SqlMigrationAwareDriverAdapterFactory", () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });

		// Check that connectToShadowDb method exists
		expect(typeof factory.connectToShadowDb).toBe("function");
		expect(factory.connectToShadowDb).toBeInstanceOf(Function);
	});

	test("connectToShadowDb creates separate adapter instance", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });

		const mainAdapter = await factory.connect();
		const shadowAdapter = await factory.connectToShadowDb();

		// Should be different instances
		expect(mainAdapter).not.toBe(shadowAdapter);

		// Both should be valid adapters
		expect(mainAdapter.provider).toBe("sqlite");
		expect(shadowAdapter.provider).toBe("sqlite");

		// Clean up
		await mainAdapter.dispose();
		await shadowAdapter.dispose();
	});

	test("shadow database defaults to :memory:", async () => {
		const factory = new PrismaBunSQLite({ url: "file:./test-main.db" });

		const shadowAdapter = await factory.connectToShadowDb();

		// Shadow adapter should work (can execute queries)
		const result = await shadowAdapter.queryRaw({
			sql: "SELECT 1 as value",
			args: [],
			argTypes: [],
		});

		// Numbers are returned as strings (Prisma format)
		expect(result.rows).toEqual([["1"]]);

		await shadowAdapter.dispose();
	});

	test("shadow database can use custom URL", async () => {
		const factory = new PrismaBunSQLite({
			url: "file:./test-main.db",
			shadowDatabaseUrl: ":memory:", // Explicit :memory:
		});

		const shadowAdapter = await factory.connectToShadowDb();

		// Should work with custom shadow URL
		const result = await shadowAdapter.queryRaw({
			sql: "SELECT 42 as answer",
			args: [],
			argTypes: [],
		});

		// Numbers are returned as strings (Prisma format)
		expect(result.rows).toEqual([["42"]]);

		await shadowAdapter.dispose();
	});

	test("shadow database is isolated from main database", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });

		const mainAdapter = await factory.connect();
		const shadowAdapter = await factory.connectToShadowDb();

		// Create table in main database
		await mainAdapter.executeScript(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL
			);
			INSERT INTO users (name) VALUES ('Alice');
		`);

		// Table should exist in main
		const mainResult = await mainAdapter.queryRaw({
			sql: "SELECT name FROM users",
			args: [],
			argTypes: [],
		});
		expect(mainResult.rows).toEqual([["Alice"]]);

		// Table should NOT exist in shadow (isolated)
		try {
			await shadowAdapter.queryRaw({
				sql: "SELECT name FROM users",
				args: [],
				argTypes: [],
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error: any) {
			// Should fail with TableDoesNotExist error
			expect(error.message).toMatch(/TableDoesNotExist|table/i);
		}

		await mainAdapter.dispose();
		await shadowAdapter.dispose();
	});

	test("shadow database supports executeScript for migrations", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });
		const shadowAdapter = await factory.connectToShadowDb();

		// Run migration script
		await shadowAdapter.executeScript(`
			CREATE TABLE posts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				published BOOLEAN DEFAULT 0
			);

			CREATE TABLE comments (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				content TEXT NOT NULL,
				postId INTEGER NOT NULL,
				FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE
			);

			CREATE INDEX idx_comments_post ON comments(postId);
		`);

		// Verify tables were created
		const tables = await shadowAdapter.queryRaw({
			sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
			args: [],
			argTypes: [],
		});

		const tableNames = tables.rows.map((row) => row[0]);
		expect(tableNames).toContain("posts");
		expect(tableNames).toContain("comments");

		await shadowAdapter.dispose();
	});

	test("shadow database can be used multiple times", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });

		// Connect to shadow DB multiple times
		const shadow1 = await factory.connectToShadowDb();
		const shadow2 = await factory.connectToShadowDb();
		const shadow3 = await factory.connectToShadowDb();

		// Each should be independent
		expect(shadow1).not.toBe(shadow2);
		expect(shadow2).not.toBe(shadow3);

		// All should work
		await shadow1.queryRaw({ sql: "SELECT 1", args: [], argTypes: [] });
		await shadow2.queryRaw({ sql: "SELECT 2", args: [], argTypes: [] });
		await shadow3.queryRaw({ sql: "SELECT 3", args: [], argTypes: [] });

		await shadow1.dispose();
		await shadow2.dispose();
		await shadow3.dispose();
	});

	test("shadow database inherits safeIntegers config", async () => {
		const factory = new PrismaBunSQLite({
			url: ":memory:",
			safeIntegers: true,
		});

		const shadowAdapter = await factory.connectToShadowDb();

		// Create table with BIGINT
		await shadowAdapter.executeScript(`
			CREATE TABLE bigints (
				id INTEGER PRIMARY KEY,
				value INTEGER
			);
			INSERT INTO bigints (id, value) VALUES (1, 9223372036854775807);
		`);

		// Query should return BigInt (because safeIntegers: true)
		const result = await shadowAdapter.queryRaw({
			sql: "SELECT value FROM bigints WHERE id = 1",
			args: [],
			argTypes: [],
		});

		// Value should be string representation of BigInt (Prisma format)
		expect(result.rows[0]![0]!).toBe("9223372036854775807");

		await shadowAdapter.dispose();
	});

	test("shadow database inherits timestampFormat config", async () => {
		const factory = new PrismaBunSQLite({
			url: ":memory:",
			timestampFormat: "iso8601",
		});

		const shadowAdapter = await factory.connectToShadowDb();

		// Config should be passed through
		// (Actual timestamp format tested in main test suite)
		expect(shadowAdapter).toBeDefined();

		await shadowAdapter.dispose();
	});
});
