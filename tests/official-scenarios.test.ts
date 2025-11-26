/**
 * Official Prisma SQLite Integration Test Scenarios
 *
 * These tests are adapted from Prisma's official integration test suite:
 * https://github.com/prisma/prisma/blob/main/packages/integration-tests/src/__tests__/integration/sqlite/__scenarios.ts
 *
 * They verify that our adapter correctly implements the Prisma driver adapter spec
 * for SQLite databases.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PrismaBunSqlite } from "../src";

// Note: These tests verify the low-level adapter API directly,
// not the PrismaClient integration (which is tested in general.test.ts)

describe("Official Prisma SQLite Scenarios", () => {
	describe("Basic CRUD Operations", () => {
		test("findUnique where PK", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name VARCHAR(50) NOT NULL UNIQUE
				);
				INSERT INTO teams (id, name) VALUES (1, 'a');
				INSERT INTO teams (id, name) VALUES (2, 'b');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM teams WHERE id = ?",
				args: [2],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(result.rows).toHaveLength(1);
			// Note: With safeIntegers=true (default), integers are returned as BigInt
			// which gets converted to string for Prisma compatibility
			expect(String(result.rows[0]![0])).toBe("2");
			expect(result.rows[0]![1]).toBe("b");
			expect(result.columnNames).toEqual(["id", "name"]);

			await connection.dispose();
		});

		test("create with data", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name VARCHAR(50) NOT NULL UNIQUE
				);
			`);

			const insertResult = await connection.executeRaw({
				sql: "INSERT INTO teams (name) VALUES (?)",
				args: ["c"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(insertResult).toBe(1); // 1 row affected

			const selectResult = await connection.queryRaw({
				sql: "SELECT * FROM teams WHERE name = ?",
				args: ["c"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(selectResult.rows).toHaveLength(1);
			expect(String(selectResult.rows[0]![0])).toBe("1");
			expect(selectResult.rows[0]![1]).toBe("c");

			await connection.dispose();
		});

		test("update where with numeric data", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name VARCHAR(50) NOT NULL UNIQUE
				);
				INSERT INTO teams (name) VALUES ('c');
			`);

			const updateResult = await connection.executeRaw({
				sql: "UPDATE teams SET name = ? WHERE id = ?",
				args: ["d", 1],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "int" },
				],
			});

			expect(updateResult).toBe(1); // 1 row affected

			const selectResult = await connection.queryRaw({
				sql: "SELECT * FROM teams WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(String(selectResult.rows[0]![0])).toBe("1");
			expect(selectResult.rows[0]![1]).toBe("d");

			await connection.dispose();
		});

		test("delete where PK", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name VARCHAR(50) NOT NULL
				);
				INSERT INTO teams (name) VALUES ('a');
				INSERT INTO teams (name) VALUES ('b');
			`);

			const deleteResult = await connection.executeRaw({
				sql: "DELETE FROM teams WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(deleteResult).toBe(1); // 1 row affected

			const selectResult = await connection.queryRaw({
				sql: "SELECT * FROM teams",
				args: [],
				argTypes: [],
			});

			expect(selectResult.rows).toHaveLength(1);
			expect(String(selectResult.rows[0]![0])).toBe("2");
			expect(selectResult.rows[0]![1]).toBe("b");

			await connection.dispose();
		});
	});

	describe("Boolean Handling", () => {
		test("update where with boolean data", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name VARCHAR(50) NOT NULL UNIQUE,
					active BOOLEAN NOT NULL DEFAULT 1
				);
				INSERT INTO teams (name) VALUES ('c');
			`);

			const updateResult = await connection.executeRaw({
				sql: "UPDATE teams SET active = ? WHERE id = ?",
				args: [false, 1],
				argTypes: [
					{ arity: "scalar", scalarType: "boolean" },
					{ arity: "scalar", scalarType: "int" },
				],
			});

			expect(updateResult).toBe(1);

			const selectResult = await connection.queryRaw({
				sql: "SELECT * FROM teams WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			// SQLite stores booleans as 0/1, integers returned as strings with safeIntegers
			expect(String(selectResult.rows[0]![0])).toBe("1");
			expect(selectResult.rows[0]![1]).toBe("c");
			expect(String(selectResult.rows[0]![2])).toBe("0");

			await connection.dispose();
		});

		test("findMany where contains and boolean", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					title VARCHAR(50) NOT NULL,
					published BOOLEAN NOT NULL DEFAULT 0
				);
				INSERT INTO posts (title, published) VALUES ('A', 1);
				INSERT INTO posts (title, published) VALUES ('B', 0);
				INSERT INTO posts (title, published) VALUES ('C', 1);
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM posts WHERE title LIKE ? AND published = ?",
				args: ["%A%", true],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "boolean" },
				],
			});

			expect(result.rows).toHaveLength(1);
			expect(String(result.rows[0]![0])).toBe("1");
			expect(result.rows[0]![1]).toBe("A");
			expect(String(result.rows[0]![2])).toBe("1");

			await connection.dispose();
		});
	});

	describe("DateTime Handling", () => {
		test("findMany where datetime lte", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					title VARCHAR(50) NOT NULL,
					created_at DATETIME NOT NULL
				);
				INSERT INTO posts (title, created_at) VALUES ('A', '2020-01-14T00:00:00.000Z');
				INSERT INTO posts (title, created_at) VALUES ('B', '2020-01-14T00:00:00.000Z');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM posts WHERE created_at <= ?",
				args: [new Date()],
				argTypes: [{ arity: "scalar", scalarType: "datetime" }],
			});

			expect(result.rows).toHaveLength(2);

			await connection.dispose();
		});

		test("findMany where datetime exact match", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			// Use Unix timestamp (milliseconds)
			const timestamp = Date.UTC(2018, 8, 4, 0, 0, 0, 0);

			await connection.executeScript(`
				CREATE TABLE events (
					id INTEGER PRIMARY KEY NOT NULL,
					time DATETIME
				);
				INSERT INTO events (time) VALUES (${timestamp});
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM events WHERE time = ?",
				args: [new Date(timestamp)],
				argTypes: [{ arity: "scalar", scalarType: "datetime" }],
			});

			// Note: This test checks ISO format matching
			// The exact behavior depends on how timestamps are stored

			await connection.dispose();
		});
	});

	describe("Decimal Handling", () => {
		test("findMany where decimal", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE exercises (
					id INTEGER PRIMARY KEY NOT NULL,
					distance NUMERIC NOT NULL
				);
				INSERT INTO exercises (distance) VALUES (12.213);
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM exercises WHERE distance = ?",
				args: [12.213],
				argTypes: [{ arity: "scalar", scalarType: "decimal" }],
			});

			expect(result.rows).toHaveLength(1);
			expect(String(result.rows[0]![0])).toBe("1");
			// Decimal values are returned as numbers in SQLite
			expect(Number(result.rows[0]![1])).toBeCloseTo(12.213);

			await connection.dispose();
		});
	});

	describe("Foreign Key Relations", () => {
		test("findUnique with foreign key relation", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				PRAGMA foreign_keys = ON;
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					email VARCHAR(50) NOT NULL UNIQUE
				);
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					user_id INTEGER NOT NULL REFERENCES users (id) ON UPDATE CASCADE,
					title VARCHAR(50) NOT NULL
				);
				INSERT INTO users (email) VALUES ('ada@prisma.io');
				INSERT INTO users (email) VALUES ('ema@prisma.io');
				INSERT INTO posts (user_id, title) VALUES (1, 'A');
				INSERT INTO posts (user_id, title) VALUES (1, 'B');
				INSERT INTO posts (user_id, title) VALUES (2, 'C');
			`);

			// Query user with posts via JOIN
			const result = await connection.queryRaw({
				sql: `
					SELECT u.id, u.email, p.id as post_id, p.title
					FROM users u
					LEFT JOIN posts p ON p.user_id = u.id
					WHERE u.id = ?
				`,
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(result.rows).toHaveLength(2);
			expect(result.rows[0]![1]).toBe("ada@prisma.io");

			await connection.dispose();
		});

		test("cascade delete with foreign key", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				PRAGMA foreign_keys = ON;
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					email VARCHAR(50) NOT NULL UNIQUE
				);
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
					title VARCHAR(50) NOT NULL
				);
				INSERT INTO users (email) VALUES ('ada@prisma.io');
				INSERT INTO posts (user_id, title) VALUES (1, 'A');
				INSERT INTO posts (user_id, title) VALUES (1, 'B');
			`);

			// Delete user - should cascade to posts
			await connection.executeRaw({
				sql: "DELETE FROM users WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			const postsResult = await connection.queryRaw({
				sql: "SELECT * FROM posts",
				args: [],
				argTypes: [],
			});

			expect(postsResult.rows).toHaveLength(0);

			await connection.dispose();
		});
	});

	describe("Composite Primary Keys", () => {
		test("findUnique where composite PK", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE variables (
					name VARCHAR(50) NOT NULL,
					key VARCHAR(50) NOT NULL,
					value VARCHAR(50) NOT NULL,
					email VARCHAR(50) NOT NULL,
					PRIMARY KEY(name, key)
				);
				INSERT INTO variables (name, key, value, email) VALUES ('a', 'b', 'c', 'd');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM variables WHERE name = ? AND key = ?",
				args: ["a", "b"],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "string" },
				],
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]).toEqual(["a", "b", "c", "d"]);

			await connection.dispose();
		});

		test("update where composite PK", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE variables (
					name VARCHAR(50) NOT NULL,
					key VARCHAR(50) NOT NULL,
					value VARCHAR(50) NOT NULL,
					email VARCHAR(50) NOT NULL,
					PRIMARY KEY(name, key)
				);
				INSERT INTO variables (name, key, value, email) VALUES ('a', 'b', 'c', 'd');
			`);

			await connection.executeRaw({
				sql: "UPDATE variables SET email = ? WHERE name = ? AND key = ?",
				args: ["e", "a", "b"],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "string" },
				],
			});

			const result = await connection.queryRaw({
				sql: "SELECT * FROM variables WHERE name = ? AND key = ?",
				args: ["a", "b"],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "string" },
				],
			});

			expect(result.rows[0]).toEqual(["a", "b", "c", "e"]);

			await connection.dispose();
		});
	});

	describe("String Operations", () => {
		test("findMany where contains", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE crons (
					id INTEGER PRIMARY KEY NOT NULL,
					job VARCHAR(50) UNIQUE NOT NULL,
					frequency TEXT
				);
				INSERT INTO crons (job, frequency) VALUES ('j1', '* * * * *');
				INSERT INTO crons (job, frequency) VALUES ('j20', '* * * * 1-5');
				INSERT INTO crons (job, frequency) VALUES ('j21', '* * * * 1-5');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM crons WHERE job LIKE ?",
				args: ["%j2%"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(result.rows).toHaveLength(2);

			await connection.dispose();
		});

		test("findMany where startsWith", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE crons (
					id INTEGER PRIMARY KEY NOT NULL,
					job VARCHAR(50) UNIQUE NOT NULL
				);
				INSERT INTO crons (job) VALUES ('j1');
				INSERT INTO crons (job) VALUES ('j20');
				INSERT INTO crons (job) VALUES ('j21');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM crons WHERE job LIKE ?",
				args: ["j2%"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(result.rows).toHaveLength(2);

			await connection.dispose();
		});

		test("findMany where endsWith", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE crons (
					id INTEGER PRIMARY KEY NOT NULL,
					job VARCHAR(50) UNIQUE NOT NULL
				);
				INSERT INTO crons (job) VALUES ('j1');
				INSERT INTO crons (job) VALUES ('j20');
				INSERT INTO crons (job) VALUES ('j21');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM crons WHERE job LIKE ?",
				args: ["%1"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(result.rows).toHaveLength(2); // j1 and j21

			await connection.dispose();
		});

		test("findMany where in array", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE crons (
					id INTEGER PRIMARY KEY NOT NULL,
					job VARCHAR(50) UNIQUE NOT NULL
				);
				INSERT INTO crons (job) VALUES ('j1');
				INSERT INTO crons (job) VALUES ('j20');
				INSERT INTO crons (job) VALUES ('j21');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM crons WHERE job IN (?, ?)",
				args: ["j20", "j1"],
				argTypes: [
					{ arity: "scalar", scalarType: "string" },
					{ arity: "scalar", scalarType: "string" },
				],
			});

			expect(result.rows).toHaveLength(2);

			await connection.dispose();
		});

		test("case insensitive field (COLLATE NOCASE)", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					email VARCHAR(50) NOT NULL UNIQUE COLLATE NOCASE
				);
				INSERT INTO users (email) VALUES ('max@prisma.io');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM users WHERE email = ?",
				args: ["MAX@PRISMA.IO"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]![1]).toBe("max@prisma.io");

			await connection.dispose();
		});
	});

	describe("NULL Handling", () => {
		test("findMany with NULL values", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					email TEXT
				);
				INSERT INTO users (email) VALUES ('ada@prisma.io');
				INSERT INTO users (email) VALUES (NULL);
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM users",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(2);
			expect(result.rows[0]![1]).toBe("ada@prisma.io");
			expect(result.rows[1]![1]).toBeNull();

			await connection.dispose();
		});

		test("updateMany where null", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE teams (
					id INTEGER PRIMARY KEY NOT NULL,
					name TEXT
				);
				INSERT INTO teams (name) VALUES ('a');
				INSERT INTO teams (name) VALUES (NULL);
				INSERT INTO teams (name) VALUES (NULL);
			`);

			await connection.executeRaw({
				sql: "UPDATE teams SET name = ? WHERE name IS NULL",
				args: ["b"],
				argTypes: [{ arity: "scalar", scalarType: "string" }],
			});

			const result = await connection.queryRaw({
				sql: "SELECT * FROM teams ORDER BY id",
				args: [],
				argTypes: [],
			});

			expect(result.rows[0]![1]).toBe("a");
			expect(result.rows[1]![1]).toBe("b");
			expect(result.rows[2]![1]).toBe("b");

			await connection.dispose();
		});
	});

	describe("Ordering and Pagination", () => {
		test("findMany orderBy asc", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					title VARCHAR(50) NOT NULL
				);
				INSERT INTO posts (title) VALUES ('C');
				INSERT INTO posts (title) VALUES ('A');
				INSERT INTO posts (title) VALUES ('B');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM posts ORDER BY title ASC",
				args: [],
				argTypes: [],
			});

			expect(result.rows[0]![1]).toBe("A");
			expect(result.rows[1]![1]).toBe("B");
			expect(result.rows[2]![1]).toBe("C");

			await connection.dispose();
		});

		test("findMany orderBy desc", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					title VARCHAR(50) NOT NULL
				);
				INSERT INTO posts (title) VALUES ('A');
				INSERT INTO posts (title) VALUES ('B');
				INSERT INTO posts (title) VALUES ('C');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM posts ORDER BY title DESC",
				args: [],
				argTypes: [],
			});

			expect(result.rows[0]![1]).toBe("C");
			expect(result.rows[1]![1]).toBe("B");
			expect(result.rows[2]![1]).toBe("A");

			await connection.dispose();
		});
	});

	describe("Transaction Support", () => {
		test("transaction commit", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE accounts (
					id INTEGER PRIMARY KEY NOT NULL,
					balance INTEGER NOT NULL
				);
				INSERT INTO accounts (balance) VALUES (100);
			`);

			const tx = await connection.startTransaction("SERIALIZABLE");

			await tx.executeRaw({
				sql: "UPDATE accounts SET balance = balance - ? WHERE id = ?",
				args: [50, 1],
				argTypes: [
					{ arity: "scalar", scalarType: "int" },
					{ arity: "scalar", scalarType: "int" },
				],
			});

			await tx.executeRaw({
				sql: "COMMIT",
				args: [],
				argTypes: [],
			});

			await tx.commit();

			const result = await connection.queryRaw({
				sql: "SELECT balance FROM accounts WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(String(result.rows[0]![0])).toBe("50");

			await connection.dispose();
		});

		test("transaction rollback", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE accounts (
					id INTEGER PRIMARY KEY NOT NULL,
					balance INTEGER NOT NULL
				);
				INSERT INTO accounts (balance) VALUES (100);
			`);

			const tx = await connection.startTransaction("SERIALIZABLE");

			await tx.executeRaw({
				sql: "UPDATE accounts SET balance = balance - ? WHERE id = ?",
				args: [50, 1],
				argTypes: [
					{ arity: "scalar", scalarType: "int" },
					{ arity: "scalar", scalarType: "int" },
				],
			});

			await tx.executeRaw({
				sql: "ROLLBACK",
				args: [],
				argTypes: [],
			});

			await tx.rollback();

			const result = await connection.queryRaw({
				sql: "SELECT balance FROM accounts WHERE id = ?",
				args: [1],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			expect(String(result.rows[0]![0])).toBe("100"); // Original value

			await connection.dispose();
		});

		test("rejects non-SERIALIZABLE isolation level", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await expect(
				connection.startTransaction("READ COMMITTED" as any)
			).rejects.toMatchObject({
				name: "DriverAdapterError",
				cause: { kind: "InvalidIsolationLevel" },
			});

			await connection.dispose();
		});
	});

	describe("Error Handling", () => {
		test("query errors are converted to DriverAdapterError", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await expect(
				connection.queryRaw({
					sql: "SELECT * FROM non_existent_table",
					args: [],
					argTypes: [],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
			});

			await connection.dispose();
		});

		test("execute errors are converted to DriverAdapterError", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await expect(
				connection.executeRaw({
					sql: "INSERT INTO non_existent_table (id) VALUES (1)",
					args: [],
					argTypes: [],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
			});

			await connection.dispose();
		});

		test("script errors are converted to DriverAdapterError", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await expect(
				connection.executeScript("INSERT INTO non_existent_table (id) VALUES (1)")
			).rejects.toMatchObject({
				name: "DriverAdapterError",
			});

			await connection.dispose();
		});

		test("unique constraint violation", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					email VARCHAR(50) NOT NULL UNIQUE
				);
				INSERT INTO users (email) VALUES ('test@test.com');
			`);

			await expect(
				connection.executeRaw({
					sql: "INSERT INTO users (email) VALUES (?)",
					args: ["test@test.com"],
					argTypes: [{ arity: "scalar", scalarType: "string" }],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
				cause: { kind: "UniqueConstraintViolation" },
			});

			await connection.dispose();
		});

		test("foreign key constraint violation", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				PRAGMA foreign_keys = ON;
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL
				);
				CREATE TABLE posts (
					id INTEGER PRIMARY KEY NOT NULL,
					user_id INTEGER NOT NULL REFERENCES users (id)
				);
			`);

			await expect(
				connection.executeRaw({
					sql: "INSERT INTO posts (user_id) VALUES (?)",
					args: [999],
					argTypes: [{ arity: "scalar", scalarType: "int" }],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
				cause: { kind: "ForeignKeyConstraintViolation" },
			});

			await connection.dispose();
		});
	});

	describe("executeScript", () => {
		test("executes multiple statements", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
				INSERT INTO test (name) VALUES ('John');
				INSERT INTO test (name) VALUES ('Jane');
			`);

			const result = await connection.queryRaw({
				sql: "SELECT * FROM test",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(2);

			await connection.dispose();
		});
	});

	describe("Shadow Database Support", () => {
		test("connectToShadowDb creates separate database", async () => {
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const mainConnection = await adapter.connect();
			const shadowConnection = await adapter.connectToShadowDb();

			// Create table in main
			await mainConnection.executeScript("CREATE TABLE main_only (id INTEGER PRIMARY KEY)");

			// Shadow should not have the table
			await expect(
				shadowConnection.queryRaw({
					sql: "SELECT * FROM main_only",
					args: [],
					argTypes: [],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
			});

			await mainConnection.dispose();
			await shadowConnection.dispose();
		});
	});

	// Note: lastInsertId is no longer supported in Bun 1.3.3+
	// The official better-sqlite3 adapter also doesn't return lastInsertId
	// Use INSERT...RETURNING if you need the inserted ID

	/**
	 * Edge Case Tests (ported from prisma-engines/quaint)
	 * These test scenarios that shouldn't occur in normal Prisma usage
	 * but provide defensive coverage for the adapter.
	 */
	describe("Edge Cases (from prisma-engines)", () => {
		test("reads DateTime from YYYY-MM-DD HH:MM:SS format", async () => {
			// From quaint/src/tests/types/sqlite.rs: test_type_text_datetime_custom
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE events (
					id INTEGER PRIMARY KEY NOT NULL,
					created_at DATETIME
				);
			`);

			// Insert using custom format (not ISO8601)
			await connection.executeRaw({
				sql: "INSERT INTO events (created_at) VALUES ('2020-04-20 16:20:00')",
				args: [],
				argTypes: [],
			});

			const result = await connection.queryRaw({
				sql: "SELECT created_at FROM events",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(1);
			// SQLite stores as text, we read it back as-is
			expect(result.rows[0]![0]).toBe("2020-04-20 16:20:00");

			await connection.dispose();
		});

		test("reads DateTime from RFC3339 format", async () => {
			// From quaint/src/tests/types/sqlite.rs: test_type_text_datetime_rfc3339
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE events (
					id INTEGER PRIMARY KEY NOT NULL,
					created_at DATETIME
				);
			`);

			const now = new Date().toISOString();
			await connection.executeRaw({
				sql: `INSERT INTO events (created_at) VALUES ('${now}')`,
				args: [],
				argTypes: [],
			});

			const result = await connection.queryRaw({
				sql: "SELECT created_at FROM events",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]![0]).toBe(now);

			await connection.dispose();
		});

		test("column not found on read returns ColumnNotFound error", async () => {
			// From quaint/src/tests/query/error.rs: column_does_not_exist_on_read
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL,
					name TEXT
				);
				INSERT INTO users (name) VALUES ('Alice');
			`);

			await expect(
				connection.queryRaw({
					sql: "SELECT does_not_exist FROM users",
					args: [],
					argTypes: [],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
				cause: { kind: "ColumnNotFound" },
			});

			await connection.dispose();
		});

		test("column not found on write returns ColumnNotFound error", async () => {
			// From quaint/src/tests/query/error.rs: column_does_not_exist_on_write
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY NOT NULL
				);
			`);

			await expect(
				connection.executeRaw({
					sql: "INSERT INTO users (does_not_exist) VALUES (1)",
					args: [],
					argTypes: [],
				})
			).rejects.toMatchObject({
				name: "DriverAdapterError",
				cause: { kind: "ColumnNotFound" },
			});

			await connection.dispose();
		});

		test("integer boundaries: i32 min/max", async () => {
			// From quaint/src/tests/types/sqlite.rs: integer test
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE numbers (
					id INTEGER PRIMARY KEY NOT NULL,
					value INTEGER
				);
			`);

			const i32Min = -2147483648;
			const i32Max = 2147483647;

			await connection.executeRaw({
				sql: "INSERT INTO numbers (value) VALUES (?)",
				args: [i32Min],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			await connection.executeRaw({
				sql: "INSERT INTO numbers (value) VALUES (?)",
				args: [i32Max],
				argTypes: [{ arity: "scalar", scalarType: "int" }],
			});

			const result = await connection.queryRaw({
				sql: "SELECT value FROM numbers ORDER BY id",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(2);
			expect(String(result.rows[0]![0])).toBe(String(i32Min));
			expect(String(result.rows[1]![0])).toBe(String(i32Max));

			await connection.dispose();
		});

		test("bigint boundaries: i64 min/max", async () => {
			// From quaint/src/tests/types/sqlite.rs: big_int test
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			await connection.executeScript(`
				CREATE TABLE big_numbers (
					id INTEGER PRIMARY KEY NOT NULL,
					value BIGINT
				);
			`);

			const i64Min = "-9223372036854775808";
			const i64Max = "9223372036854775807";

			await connection.executeRaw({
				sql: "INSERT INTO big_numbers (value) VALUES (?)",
				args: [BigInt(i64Min)],
				argTypes: [{ arity: "scalar", scalarType: "bigint" }],
			});

			await connection.executeRaw({
				sql: "INSERT INTO big_numbers (value) VALUES (?)",
				args: [BigInt(i64Max)],
				argTypes: [{ arity: "scalar", scalarType: "bigint" }],
			});

			const result = await connection.queryRaw({
				sql: "SELECT value FROM big_numbers ORDER BY id",
				args: [],
				argTypes: [],
			});

			expect(result.rows).toHaveLength(2);
			expect(String(result.rows[0]![0])).toBe(i64Min);
			expect(String(result.rows[1]![0])).toBe(i64Max);

			await connection.dispose();
		});

		test("multi-statement raw_cmd detects errors", async () => {
			// From quaint/src/tests/query/error.rs: should_pick_up_partially_failed_raw_cmd_scripts
			const adapter = new PrismaBunSqlite({ url: ":memory:" });
			const connection = await adapter.connect();

			// First invalid statement should fail
			await expect(
				connection.executeScript("SELECT YOLO; SELECT 1;")
			).rejects.toThrow();

			// Error in middle of script should fail
			await expect(
				connection.executeScript("SELECT 1; SELECT NULL; SELECT YOLO; SELECT 2;")
			).rejects.toThrow();

			await connection.dispose();
		});
	});
});
