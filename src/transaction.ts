/**
 * Transaction implementation with state tracking and async mutex
 */

import { Database } from "bun:sqlite";
import {
	DriverAdapterError,
	type SqlQuery,
	type SqlResultSet,
	type Transaction,
	type TransactionOptions,
} from "@prisma/driver-adapter-utils";

import type { PrismaBunSqliteOptions, TransactionState } from "./types.js";
import { BunSqliteQueryable, debug } from "./queryable.js";

/**
 * Simple async mutex for serializing operations
 * Ensures only one transaction runs at a time
 */
export class AsyncMutex {
	private locked = false;
	private queue: Array<() => void> = [];
	private maxQueueSize: number;

	/**
	 * Create a new AsyncMutex
	 * @param maxQueueSize Maximum number of waiters allowed in queue (default: 1000)
	 */
	constructor(maxQueueSize = 1000) {
		this.maxQueueSize = maxQueueSize;
	}

	async acquire(): Promise<() => void> {
		// If not locked, acquire immediately
		if (!this.locked) {
			this.locked = true;
			return this.createReleaser();
		}

		// Check queue size limit to prevent unbounded memory growth
		if (this.queue.length >= this.maxQueueSize) {
			throw new Error(
				`Transaction queue full (max: ${this.maxQueueSize}). ` +
					"Too many concurrent transactions waiting. Consider reducing concurrency or increasing maxQueueSize.",
			);
		}

		// Otherwise, wait in queue
		return new Promise<() => void>((resolve) => {
			this.queue.push(() => {
				this.locked = true;
				resolve(this.createReleaser());
			});
		});
	}

	private createReleaser(): () => void {
		let called = false;
		return () => {
			if (called) return;
			called = true;
			this.release();
		};
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
 * Transaction implementation with state tracking
 *
 * With usePhantomQuery: false, the Prisma engine sends actual COMMIT/ROLLBACK
 * SQL statements through executeRaw(). The commit/rollback methods update state
 * and release the mutex lock.
 *
 * State tracking provides defensive programming benefits:
 * - Prevents queries on closed transactions
 * - Clear error messages for debugging
 * - Catches potential Prisma engine bugs early
 */
export class BunSqliteTransaction extends BunSqliteQueryable implements Transaction {
	private state: TransactionState = "active";

	constructor(
		db: Database,
		readonly options: TransactionOptions,
		adapterOptions: PrismaBunSqliteOptions | undefined,
		private releaseLock: () => void,
	) {
		super(db, adapterOptions);
	}

	/**
	 * Execute a query within the transaction
	 * Throws if transaction is already closed
	 */
	override async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
		if (this.state !== "active") {
			throw new DriverAdapterError({
				kind: "TransactionAlreadyClosed",
				cause: `Cannot execute query on a ${this.state} transaction.`,
			});
		}
		return super.queryRaw(query);
	}

	/**
	 * Execute a statement within the transaction
	 * Throws if transaction is already closed
	 */
	override async executeRaw(query: SqlQuery): Promise<number> {
		if (this.state !== "active") {
			throw new DriverAdapterError({
				kind: "TransactionAlreadyClosed",
				cause: `Cannot execute statement on a ${this.state} transaction.`,
			});
		}
		return super.executeRaw(query);
	}

	/**
	 * Commit the transaction
	 * With usePhantomQuery: false, Prisma engine sends COMMIT via executeRaw
	 * This method updates state and releases the lock
	 */
	async commit(): Promise<void> {
		debug("[js::commit]");
		this.state = "committed";
		this.releaseLock();
	}

	/**
	 * Rollback the transaction
	 * With usePhantomQuery: false, Prisma engine sends ROLLBACK via executeRaw
	 * This method updates state and releases the lock
	 */
	async rollback(): Promise<void> {
		debug("[js::rollback]");
		this.state = "rolled_back";
		this.releaseLock();
	}
}
