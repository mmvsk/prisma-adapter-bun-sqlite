import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import type { SqlDriverAdapter, Transaction } from "@prisma/driver-adapter-utils";
import { PrismaBunSqlite } from "../src/index";

describe("transactionMode", () => {
	let tempDbPath: string;
	let other: Database;

	beforeEach(() => {
		tempDbPath = `/tmp/test-txmode-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.db`;
		// A second connection to the same file, standing in for another writer (worker, backup tool)
		other = new Database(tempDbPath);
		other.run("PRAGMA busy_timeout = 0");
	});

	afterEach(() => {
		other.close();
		for (const suffix of ["", "-wal", "-shm"]) {
			try {
				if (existsSync(tempDbPath + suffix)) unlinkSync(tempDbPath + suffix);
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	const connect = async (transactionMode?: "deferred" | "immediate" | "exclusive") => {
		const adapter = await new PrismaBunSqlite({ url: tempDbPath, wal: true, transactionMode }).connect();
		await adapter.executeScript("CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)");
		return adapter;
	};

	/** Whether the other connection can take the write lock right now. */
	const otherCanWrite = () => {
		try {
			other.run("BEGIN IMMEDIATE");
			other.run("ROLLBACK");
			return true;
		} catch (error: any) {
			if (error.code === "SQLITE_BUSY") return false;
			throw error;
		}
	};

	// As Prisma does with usePhantomQuery: false: the statement goes through executeRaw, then
	// commit()/rollback() release the transaction mutex.
	const commit = async (tx: Transaction) => {
		await tx.executeRaw({ sql: "COMMIT", args: [], argTypes: [] });
		await tx.commit();
	};
	const rollback = async (tx: Transaction) => {
		await tx.executeRaw({ sql: "ROLLBACK", args: [], argTypes: [] });
		await tx.rollback();
	};

	const select = { sql: "SELECT v FROM t", args: [], argTypes: [] };
	const insert = { sql: "INSERT INTO t (v) VALUES (1)", args: [], argTypes: [] };

	test("deferred (default) takes no lock at BEGIN", async () => {
		const adapter = await connect();
		const tx = await adapter.startTransaction();
		expect(otherCanWrite()).toBe(true);
		await rollback(tx);
		await adapter.dispose();
	});

	test("deferred: a transaction that has read fails at once when another connection holds the write lock", async () => {
		const adapter: SqlDriverAdapter = await connect("deferred");
		const tx = await adapter.startTransaction();
		await tx.queryRaw(select);

		other.run("BEGIN IMMEDIATE");
		const started = performance.now();
		await expect(tx.executeRaw(insert)).rejects.toMatchObject({ cause: { originalCode: "SQLITE_BUSY" } });
		// Well inside the default 5000 ms busy timeout: SQLite skipped the busy handler
		expect(performance.now() - started).toBeLessThan(1000);
		other.run("ROLLBACK");

		await rollback(tx);
		await adapter.dispose();
	});

	for (const mode of ["immediate", "exclusive"] as const) {
		test(`${mode} holds the write lock from BEGIN until commit`, async () => {
			const adapter = await connect(mode);
			const tx = await adapter.startTransaction();
			expect(otherCanWrite()).toBe(false);
			await tx.queryRaw(select);
			await tx.executeRaw(insert);
			await commit(tx);
			expect(otherCanWrite()).toBe(true);
			expect(other.query("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 1 });
			await adapter.dispose();
		});
	}
});
