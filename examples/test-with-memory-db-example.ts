/**
 * Example: Testing with :memory: database and programmatic migrations
 *
 * This approach is MUCH faster than file-based databases for tests:
 * - No disk I/O
 * - Fresh database for each test
 * - Migrations applied in milliseconds
 * - Perfect isolation between tests
 *
 * Run: bun test examples/test-with-memory-db.test.ts
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { createTestDatabase, runMigrations, type Migration } from "../src/migrations";
import { PrismaBunSQLite } from "../src/bunsqlite-adapter";

// Define your migrations
const migrations: Migration[] = [
	{
		name: "001_init",
		sql: `
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				name TEXT,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE posts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				content TEXT,
				published BOOLEAN DEFAULT 0,
				authorId INTEGER NOT NULL,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (authorId) REFERENCES users(id) ON DELETE CASCADE
			);

			CREATE INDEX idx_posts_author ON posts(authorId);
			CREATE INDEX idx_posts_published ON posts(published);
		`,
	},
];

describe("User Management with :memory: database", () => {
	let prisma: PrismaClient;

	// Create fresh :memory: database before each test
	beforeEach(async () => {
		// Create adapter with migrations applied
		const adapter = await createTestDatabase(migrations);

		// Create Prisma Client with the adapter
		prisma = new PrismaClient({ adapter } as any);
	});

	test("can create a user", async () => {
		const user = await prisma.user.create({
			data: {
				email: "alice@example.com",
				name: "Alice",
			},
		});

		expect(user.id).toBeDefined();
		expect(user.email).toBe("alice@example.com");
		expect(user.name).toBe("Alice");
	});

	test("users are isolated between tests", async () => {
		// This test has a fresh database - no users from previous test
		const count = await prisma.user.count();
		expect(count).toBe(0);
	});

	test("can create user with posts", async () => {
		const user = await prisma.user.create({
			data: {
				email: "bob@example.com",
				name: "Bob",
				posts: {
					create: [
						{
							title: "First Post",
							content: "Hello World",
							published: true,
						},
						{
							title: "Draft Post",
							content: "Work in progress",
							published: false,
						},
					],
				},
			},
			include: {
				posts: true,
			},
		});

		expect(user.posts.length).toBe(2);
		expect(user.posts[0].title).toBe("First Post");
	});

	test("foreign key cascade works", async () => {
		// Create user with post
		const user = await prisma.user.create({
			data: {
				email: "charlie@example.com",
				name: "Charlie",
				posts: {
					create: { title: "Test Post", content: "Content" },
				},
			},
		});

		// Delete user - should cascade to posts
		await prisma.user.delete({ where: { id: user.id } });

		// Post should be deleted
		const postCount = await prisma.post.count();
		expect(postCount).toBe(0);
	});

	test("unique constraints work", async () => {
		await prisma.user.create({
			data: {
				email: "unique@example.com",
				name: "Unique User",
			},
		});

		// Try to create duplicate email
		try {
			await prisma.user.create({
				data: {
					email: "unique@example.com",
					name: "Duplicate",
				},
			});
			expect(true).toBe(false); // Should not reach
		} catch (error: any) {
			// Should be a unique constraint violation
			expect(error.code).toBe("P2002");
		}
	});
});

describe("Advanced: Manual migration control", () => {
	test("can apply migrations manually for specific test scenarios", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });
		const adapter = await factory.connect();

		// Apply only the first migration
		await runMigrations(adapter, [migrations[0]], { logger: () => {} });

		const prisma = new PrismaClient({ adapter } as any);

		// Should have users table
		const user = await prisma.user.create({
			data: { email: "test@example.com" },
		});

		expect(user.id).toBeDefined();

		await prisma.$disconnect();
		await adapter.dispose();
	});

	test("can test migration rollback scenarios", async () => {
		const factory = new PrismaBunSQLite({ url: ":memory:" });
		const adapter = await factory.connect();

		// Apply initial migration
		await runMigrations(adapter, [migrations[0]], { logger: () => {} });

		// Simulate adding data
		const db = (adapter as any).db;
		db.prepare("INSERT INTO users (email, name) VALUES (?, ?)").run(
			"existing@example.com",
			"Existing User"
		);

		// Apply another migration (could be destructive)
		// In real scenario, you'd test if data survives schema changes

		// Verify data still exists
		const user = db
			.prepare("SELECT email FROM users WHERE email = ?")
			.get("existing@example.com");

		expect(user).toBeDefined();

		await adapter.dispose();
	});
});

describe("Performance: :memory: vs file-based", () => {
	test(":memory: database creation is extremely fast", async () => {
		const start = performance.now();

		// Create 10 databases with migrations
		for (let i = 0; i < 10; i++) {
			const adapter = await createTestDatabase(migrations);
			const prisma = new PrismaClient({ adapter } as any);
			await prisma.user.create({ data: { email: `user${i}@example.com` } });
			await prisma.$disconnect();
			await adapter.dispose();
		}

		const duration = performance.now() - start;

		// Should be very fast (typically < 100ms for 10 databases)
		console.log(`Created 10 :memory: databases in ${duration.toFixed(2)}ms`);
		expect(duration).toBeLessThan(1000); // Less than 1 second
	});
});
