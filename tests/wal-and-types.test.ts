import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { PrismaBunSqlite } from "../src/adapter";
import { existsSync, unlinkSync } from "node:fs";

describe("WAL Configuration", () => {
	let tempDbPath: string;

	beforeEach(() => {
		// Create unique temporary database file for each test
		tempDbPath = `/tmp/test-wal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.db`;
	});

	afterEach(() => {
		// Clean up temporary database files
		try {
			if (existsSync(tempDbPath)) unlinkSync(tempDbPath);
			if (existsSync(tempDbPath + "-wal")) unlinkSync(tempDbPath + "-wal");
			if (existsSync(tempDbPath + "-shm")) unlinkSync(tempDbPath + "-shm");
		} catch {
			// Ignore cleanup errors
		}
	});

	test("should not enable WAL mode by default", async () => {
		const factory = new PrismaBunSqlite({
			url: tempDbPath,
		});

		const adapter = await factory.connect();

		// Check that journal mode is not WAL
		const result = await adapter.queryRaw({
			sql: "PRAGMA journal_mode",
			args: [],
			argTypes: [],
		});

		expect(result.rows[0]).not.toEqual(["wal"]);

		await adapter.dispose();
	});

	test("should enable WAL mode when wal: true", async () => {
		const factory = new PrismaBunSqlite({
			url: tempDbPath,
			wal: true,
		});

		const adapter = await factory.connect();

		// Verify WAL mode is enabled
		const result = await adapter.queryRaw({
			sql: "PRAGMA journal_mode",
			args: [],
			argTypes: [],
		});

		expect(result.rows[0]).toEqual(["wal"]);

		await adapter.dispose();
	});

	test("should configure WAL mode with advanced options", async () => {
		const factory = new PrismaBunSqlite({
			url: tempDbPath,
			wal: {
				enabled: true,
				synchronous: "NORMAL",
				walAutocheckpoint: 2000,
				busyTimeout: 10000,
			},
		});

		const adapter = await factory.connect();

		// Verify WAL mode
		const journalResult = await adapter.queryRaw({
			sql: "PRAGMA journal_mode",
			args: [],
			argTypes: [],
		});
		expect(journalResult.rows[0]).toEqual(["wal"]);

		// Verify synchronous mode (NORMAL = 1)
		const syncResult = await adapter.queryRaw({
			sql: "PRAGMA synchronous",
			args: [],
			argTypes: [],
		});
		expect(syncResult.rows[0]).toEqual(["1"]);

		// Verify WAL autocheckpoint
		const walResult = await adapter.queryRaw({
			sql: "PRAGMA wal_autocheckpoint",
			args: [],
			argTypes: [],
		});
		expect(walResult.rows[0]).toEqual(["2000"]);

		// Verify busy timeout
		const timeoutResult = await adapter.queryRaw({
			sql: "PRAGMA busy_timeout",
			args: [],
			argTypes: [],
		});
		expect(timeoutResult.rows[0]).toEqual(["10000"]);

		await adapter.dispose();
	});

	test("should handle WAL mode disabled in config object", async () => {
		const factory = new PrismaBunSqlite({
			url: tempDbPath,
			wal: {
				enabled: false,
			},
		});

		const adapter = await factory.connect();

		// Verify WAL mode is not enabled
		const result = await adapter.queryRaw({
			sql: "PRAGMA journal_mode",
			args: [],
			argTypes: [],
		});

		expect(result.rows[0]).not.toEqual(["wal"]);

		await adapter.dispose();
	});

	test("should work with memory database and ignore WAL mode", async () => {
		const factory = new PrismaBunSqlite({
			url: ":memory:",
			wal: true,
		});

		const adapter = await factory.connect();

		// Memory databases don't support WAL mode, so it should be ignored
		const result = await adapter.queryRaw({
			sql: "PRAGMA journal_mode",
			args: [],
			argTypes: [],
		});

		// Memory databases return 'memory' mode instead of 'wal'
		expect(result.rows[0]).toEqual(["memory"]);

		await adapter.dispose();
	});

	test("should handle different synchronous modes", async () => {
		const modes = [
			{ config: "OFF", expected: "0" },
			{ config: "NORMAL", expected: "1" },
			{ config: "FULL", expected: "2" },
			{ config: "EXTRA", expected: "3" },
		] as const;

		for (const mode of modes) {
			const dbPath = `/tmp/test-sync-${mode.config}-${Date.now()}.db`;

			try {
				const factory = new PrismaBunSqlite({
					url: dbPath,
					wal: {
						enabled: true,
						synchronous: mode.config,
					},
				});

				const adapter = await factory.connect();

				const result = await adapter.queryRaw({
					sql: "PRAGMA synchronous",
					args: [],
					argTypes: [],
				});

				expect(result.rows[0]).toEqual([mode.expected]);

				await adapter.dispose();
			} finally {
				// Cleanup
				try {
					if (existsSync(dbPath)) unlinkSync(dbPath);
					if (existsSync(dbPath + "-wal")) unlinkSync(dbPath + "-wal");
					if (existsSync(dbPath + "-shm")) unlinkSync(dbPath + "-shm");
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	});

	test("should work with shadow database", async () => {
		const shadowDbPath = `/tmp/test-shadow-${Date.now()}.db`;

		try {
			const factory = new PrismaBunSqlite({
				url: tempDbPath,
				shadowDatabaseUrl: shadowDbPath,
				wal: true,
			});

			const adapter = await factory.connectToShadowDb();

			// Verify WAL mode is enabled on shadow database
			const result = await adapter.queryRaw({
				sql: "PRAGMA journal_mode",
				args: [],
				argTypes: [],
			});

			expect(result.rows[0]).toEqual(["wal"]);

			await adapter.dispose();
		} finally {
			// Cleanup shadow database
			try {
				if (existsSync(shadowDbPath)) unlinkSync(shadowDbPath);
				if (existsSync(shadowDbPath + "-wal")) unlinkSync(shadowDbPath + "-wal");
				if (existsSync(shadowDbPath + "-shm")) unlinkSync(shadowDbPath + "-shm");
			} catch {
				// Ignore cleanup errors
			}
		}
	});
});

describe("UNSIGNED Integer Type Support", () => {
	let factory: PrismaBunSqlite;

	beforeEach(async () => {
		factory = new PrismaBunSqlite({ url: ":memory:" });
	});

	test("should correctly handle INTEGER UNSIGNED like Prisma migrations table", async () => {
		const adapter = await factory.connect();

		// This reproduces the exact issue found with Prisma's _prisma_migrations table
		await adapter.executeScript(`
      CREATE TABLE "_prisma_migrations" (
          "id"                    TEXT PRIMARY KEY NOT NULL,
          "checksum"              TEXT NOT NULL,
          "finished_at"           DATETIME,
          "migration_name"        TEXT NOT NULL,
          "logs"                  TEXT,
          "rolled_back_at"        DATETIME,
          "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
          "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
      );
    `);

		// Insert a migration record
		await adapter.executeRaw({
			sql: `INSERT INTO "_prisma_migrations" (
        id, checksum, migration_name, started_at, finished_at, applied_steps_count
      ) VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				"test-migration-id",
				"test-checksum",
				"20250820000000_test",
				"2025-08-20T15:31:44.333+00:00",
				"2025-08-20T15:31:44.397+00:00",
				1,
			],
			argTypes: [
				{ scalarType: "string", arity: "scalar" },
				{ scalarType: "string", arity: "scalar" },
				{ scalarType: "string", arity: "scalar" },
				{ scalarType: "datetime", arity: "scalar" },
				{ scalarType: "datetime", arity: "scalar" },
				{ scalarType: "int", arity: "scalar" },
			],
		});

		// Query the migration data
		const result = await adapter.queryRaw({
			sql: `SELECT
          id,
          checksum,
          finished_at,
          migration_name,
          logs,
          rolled_back_at,
          started_at,
          applied_steps_count
      FROM "_prisma_migrations"`,
			args: [],
			argTypes: [],
		});

		expect(result.rows).toHaveLength(1);

		// Verify that the INTEGER UNSIGNED column is properly typed as Int32
		// ColumnTypeEnum.Int32 = 0
		expect(result.columnTypes[7]).toBe(0);

		// Verify the value is correctly handled
		// With safeIntegers: true (default), integers are returned as bigint and then converted to string
		const row = result.rows[0];
		expect(row).toBeDefined();
		expect(row![7]).toBe("1"); // applied_steps_count as string (from BigInt conversion)

		await adapter.dispose();
	});

	test("should handle all UNSIGNED integer variants", async () => {
		const adapter = await factory.connect();

		await adapter.executeScript(`
      CREATE TABLE test_unsigned (
          id TEXT PRIMARY KEY,
          tinyint_unsigned TINYINT UNSIGNED,
          smallint_unsigned SMALLINT UNSIGNED,
          mediumint_unsigned MEDIUMINT UNSIGNED,
          int_unsigned INT UNSIGNED,
          integer_unsigned INTEGER UNSIGNED,
          bigint_unsigned BIGINT UNSIGNED
      );
    `);

		const result = await adapter.queryRaw({
			sql: "SELECT * FROM test_unsigned LIMIT 0",
			args: [],
			argTypes: [],
		});

		// All integer types should be properly mapped (0 = Int32, 1 = Int64)
		expect(result.columnTypes[1]).toBe(0); // TINYINT UNSIGNED -> Int32
		expect(result.columnTypes[2]).toBe(0); // SMALLINT UNSIGNED -> Int32
		expect(result.columnTypes[3]).toBe(0); // MEDIUMINT UNSIGNED -> Int32
		expect(result.columnTypes[4]).toBe(0); // INT UNSIGNED -> Int32
		expect(result.columnTypes[5]).toBe(0); // INTEGER UNSIGNED -> Int32
		expect(result.columnTypes[6]).toBe(1); // BIGINT UNSIGNED -> Int64

		await adapter.dispose();
	});
});

describe("VARCHAR and Type Length Specifiers", () => {
	let factory: PrismaBunSqlite;

	beforeEach(() => {
		factory = new PrismaBunSqlite({ url: ":memory:" });
	});

	test("should handle VARCHAR with length specifiers", async () => {
		const adapter = await factory.connect();

		await adapter.executeScript(`
      CREATE TABLE test_varchar (
          id INTEGER PRIMARY KEY,
          varchar_255 VARCHAR(255),
          varchar_191 VARCHAR(191),
          varchar_plain VARCHAR,
          char_10 CHAR(10),
          nchar_50 NCHAR(50)
      );
    `);

		const result = await adapter.queryRaw({
			sql: "SELECT * FROM test_varchar LIMIT 0",
			args: [],
			argTypes: [],
		});

		// All text types should be mapped to Text (ColumnTypeEnum.Text = 7)
		expect(result.columnTypes[1]).toBe(7); // VARCHAR(255)
		expect(result.columnTypes[2]).toBe(7); // VARCHAR(191)
		expect(result.columnTypes[3]).toBe(7); // VARCHAR
		expect(result.columnTypes[4]).toBe(7); // CHAR(10)
		expect(result.columnTypes[5]).toBe(7); // NCHAR(50)

		await adapter.dispose();
	});

	test("should handle common Prisma schema types", async () => {
		const adapter = await factory.connect();

		await adapter.executeScript(`
      CREATE TABLE user_example (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(191) UNIQUE,
        age INTEGER UNSIGNED,
        balance DECIMAL(10,2),
        is_active BOOLEAN DEFAULT true,
        profile JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
    `);

		const result = await adapter.queryRaw({
			sql: "SELECT * FROM user_example LIMIT 0",
			args: [],
			argTypes: [],
		});

		// Verify all column types are correctly mapped
		expect(result.columnTypes[0]).toBe(7); // TEXT
		expect(result.columnTypes[1]).toBe(7); // VARCHAR(255)
		expect(result.columnTypes[2]).toBe(7); // VARCHAR(191)
		expect(result.columnTypes[3]).toBe(0); // INTEGER UNSIGNED -> Int32
		expect(result.columnTypes[4]).toBe(4); // DECIMAL -> Numeric
		expect(result.columnTypes[5]).toBe(5); // BOOLEAN
		expect(result.columnTypes[6]).toBe(11); // JSON
		expect(result.columnTypes[7]).toBe(10); // DATETIME
		expect(result.columnTypes[8]).toBe(10); // DATETIME

		await adapter.dispose();
	});
});

describe("JSON Type Support", () => {
	let factory: PrismaBunSqlite;

	beforeEach(() => {
		factory = new PrismaBunSqlite({ url: ":memory:" });
	});

	test("should handle both JSON and JSONB types", async () => {
		const adapter = await factory.connect();

		await adapter.executeScript(`
      CREATE TABLE test_json (
          id INTEGER PRIMARY KEY,
          json_col JSON,
          jsonb_col JSONB
      );
    `);

		const result = await adapter.queryRaw({
			sql: "SELECT * FROM test_json LIMIT 0",
			args: [],
			argTypes: [],
		});

		// Both JSON and JSONB should map to Json type (ColumnTypeEnum.Json = 11)
		expect(result.columnTypes[1]).toBe(11); // JSON
		expect(result.columnTypes[2]).toBe(11); // JSONB

		await adapter.dispose();
	});
});

describe("CHAR Type Support", () => {
	let factory: PrismaBunSqlite;

	beforeEach(() => {
		factory = new PrismaBunSqlite({ url: ":memory:" });
	});

	test("should handle CHAR type variants", async () => {
		const adapter = await factory.connect();

		await adapter.executeScript(`
      CREATE TABLE test_char (
          id INTEGER PRIMARY KEY,
          char_col CHAR,
          char_10 CHAR(10),
          character_col CHARACTER,
          character_20 CHARACTER(20)
      );
    `);

		const result = await adapter.queryRaw({
			sql: "SELECT * FROM test_char LIMIT 0",
			args: [],
			argTypes: [],
		});

		// All CHAR variants should map to Text (ColumnTypeEnum.Text = 7)
		expect(result.columnTypes[1]).toBe(7); // CHAR
		expect(result.columnTypes[2]).toBe(7); // CHAR(10)
		expect(result.columnTypes[3]).toBe(7); // CHARACTER
		expect(result.columnTypes[4]).toBe(7); // CHARACTER(20)

		await adapter.dispose();
	});
});
