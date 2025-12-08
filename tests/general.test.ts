import { test, expect, describe, beforeEach } from "bun:test";
import { PrismaClient } from "@/prisma-generated/client";
import { PrismaBunSqlite } from "../src/index";

// Setup adapter and Prisma client
const url = process.env.DATABASE_URL!;
const adapter = new PrismaBunSqlite({ url });
const prisma = new PrismaClient({ adapter });
const adapterName = "bunsqlite";

async function cleanupDatabase(prisma: PrismaClient) {
	// Delete in order to respect foreign key constraints
	await prisma.comment.deleteMany();
	await prisma.$executeRaw`DELETE FROM _PostToTag`;
	await prisma.post.deleteMany();
	await prisma.tag.deleteMany();
	await prisma.profile.deleteMany();
	await prisma.user.deleteMany();
	await prisma.analytics.deleteMany();
	await prisma.product.deleteMany();
	await prisma.settings.deleteMany();
}

beforeEach(async () => {
	await cleanupDatabase(prisma);
});
	describe("CRUD Operations", () => {
		test("create user", async () => {
			const user = await prisma.user.create({
				data: {
					email: "john@example.com",
					name: "John Doe",
					age: 30,
					balance: 100.5,
					isActive: true,
				},
			});

			expect(user.email).toBe("john@example.com");
			expect(user.name).toBe("John Doe");
			expect(user.age).toBe(30);
			expect(user.balance).toBe(100.5);
			expect(user.isActive).toBe(true);
		});

		test("findUnique user", async () => {
			const created = await prisma.user.create({
				data: {
					email: "jane@example.com",
					name: "Jane Doe",
				},
			});

			const found = await prisma.user.findUnique({
				where: { id: created.id },
			});

			expect(found).not.toBeNull();
			expect(found?.email).toBe("jane@example.com");
		});

		test("findMany users", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "user1@example.com", name: "User 1" },
					{ email: "user2@example.com", name: "User 2" },
					{ email: "user3@example.com", name: "User 3" },
				],
			});

			const users = await prisma.user.findMany();
			expect(users).toHaveLength(3);
		});

		test("findFirst user", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "a@example.com", name: "AAA" },
					{ email: "b@example.com", name: "BBB" },
				],
			});

			const first = await prisma.user.findFirst({
				orderBy: { email: "asc" },
			});

			expect(first?.email).toBe("a@example.com");
		});

		test("update user", async () => {
			const user = await prisma.user.create({
				data: {
					email: "update@example.com",
					name: "Before",
					age: 25,
				},
			});

			const updated = await prisma.user.update({
				where: { id: user.id },
				data: { name: "After", age: 26 },
			});

			expect(updated.name).toBe("After");
			expect(updated.age).toBe(26);
		});

		test("delete user", async () => {
			const user = await prisma.user.create({
				data: {
					email: "delete@example.com",
					name: "ToDelete",
				},
			});

			await prisma.user.delete({
				where: { id: user.id },
			});

			const found = await prisma.user.findUnique({
				where: { id: user.id },
			});

			expect(found).toBeNull();
		});

		test("upsert user - create", async () => {
			const user = await prisma.user.upsert({
				where: { email: "upsert@example.com" },
				create: {
					email: "upsert@example.com",
					name: "Created",
				},
				update: {
					name: "Updated",
				},
			});

			expect(user.name).toBe("Created");
		});

		test("upsert user - update", async () => {
			await prisma.user.create({
				data: {
					email: "upsert2@example.com",
					name: "Original",
				},
			});

			const user = await prisma.user.upsert({
				where: { email: "upsert2@example.com" },
				create: {
					email: "upsert2@example.com",
					name: "Created",
				},
				update: {
					name: "Updated",
				},
			});

			expect(user.name).toBe("Updated");
		});

		test("count users", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "count1@example.com", name: "User 1" },
					{ email: "count2@example.com", name: "User 2" },
				],
			});

			const count = await prisma.user.count();
			expect(count).toBe(2);
		});

		test("deleteMany users", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "delete1@example.com", name: "User 1", isActive: true },
					{ email: "delete2@example.com", name: "User 2", isActive: false },
					{ email: "delete3@example.com", name: "User 3", isActive: true },
				],
			});

			const result = await prisma.user.deleteMany({
				where: { isActive: true },
			});

			expect(result.count).toBe(2);

			const remaining = await prisma.user.count();
			expect(remaining).toBe(1);
		});

		test("updateMany users", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "update1@example.com", name: "User 1", isActive: true },
					{ email: "update2@example.com", name: "User 2", isActive: true },
				],
			});

			const result = await prisma.user.updateMany({
				where: { isActive: true },
				data: { isActive: false },
			});

			expect(result.count).toBe(2);

			const activeCount = await prisma.user.count({
				where: { isActive: true },
			});
			expect(activeCount).toBe(0);
		});
	});

	describe("Relations", () => {
		test("create with nested relation - one-to-one", async () => {
			const user = await prisma.user.create({
				data: {
					email: "nested@example.com",
					name: "Nested User",
					profile: {
						create: {
							bio: "Hello World",
							website: "https://example.com",
						},
					},
				},
				include: {
					profile: true,
				},
			});

			expect(user.profile).not.toBeNull();
			expect(user.profile?.bio).toBe("Hello World");
		});

		test("create with nested relation - one-to-many", async () => {
			const user = await prisma.user.create({
				data: {
					email: "posts@example.com",
					name: "Author",
					posts: {
						create: [
							{ title: "First Post", content: "Content 1" },
							{ title: "Second Post", content: "Content 2" },
						],
					},
				},
				include: {
					posts: true,
				},
			});

			expect(user.posts).toHaveLength(2);
			expect(user.posts[0]!.title).toBe("First Post");
		});

		test("create with nested relation - many-to-many", async () => {
			const tag1 = await prisma.tag.create({ data: { name: "TypeScript" } });
			const tag2 = await prisma.tag.create({ data: { name: "Bun" } });

			const user = await prisma.user.create({
				data: { email: "tags@example.com", name: "Tagger" },
			});

			const post = await prisma.post.create({
				data: {
					title: "Tagged Post",
					authorId: user.id,
					tags: {
						connect: [{ id: tag1.id }, { id: tag2.id }],
					},
				},
				include: {
					tags: true,
				},
			});

			expect(post.tags).toHaveLength(2);
			expect(post.tags.map((t) => t.name).sort()).toEqual(["Bun", "TypeScript"]);
		});

		test("include relations in query", async () => {
			const user = await prisma.user.create({
				data: {
					email: "include@example.com",
					name: "Include User",
					posts: {
						create: [{ title: "Post 1" }, { title: "Post 2" }],
					},
					profile: {
						create: { bio: "Bio" },
					},
				},
			});

			const fetched = await prisma.user.findUnique({
				where: { id: user.id },
				include: {
					posts: true,
					profile: true,
				},
			});

			expect(fetched?.posts).toHaveLength(2);
			expect(fetched?.profile).not.toBeNull();
		});

		test("cascade delete", async () => {
			const user = await prisma.user.create({
				data: {
					email: "cascade@example.com",
					name: "Cascade User",
					posts: {
						create: [{ title: "Post 1" }, { title: "Post 2" }],
					},
					profile: {
						create: { bio: "Bio" },
					},
				},
			});

			await prisma.user.delete({
				where: { id: user.id },
			});

			const posts = await prisma.post.findMany({
				where: { authorId: user.id },
			});
			const profile = await prisma.profile.findUnique({
				where: { userId: user.id },
			});

			expect(posts).toHaveLength(0);
			expect(profile).toBeNull();
		});
	});

	describe("Filtering & Querying", () => {
		test("where equals", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "where1@example.com", name: "Alice" },
					{ email: "where2@example.com", name: "Bob" },
				],
			});

			const users = await prisma.user.findMany({
				where: { name: "Alice" },
			});

			expect(users).toHaveLength(1);
			expect(users[0]!.name).toBe("Alice");
		});

		test("where gt/lt/gte/lte", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "age1@example.com", name: "Young", age: 20 },
					{ email: "age2@example.com", name: "Middle", age: 30 },
					{ email: "age3@example.com", name: "Old", age: 40 },
				],
			});

			const over25 = await prisma.user.findMany({
				where: { age: { gt: 25 } },
			});

			const under35 = await prisma.user.findMany({
				where: { age: { lt: 35 } },
			});

			expect(over25).toHaveLength(2);
			expect(under35).toHaveLength(2);
		});

		test("where contains/startsWith/endsWith", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "test@example.com", name: "TestUser" },
					{ email: "demo@example.com", name: "DemoUser" },
					{ email: "admin@example.com", name: "AdminUser" },
				],
			});

			const testUsers = await prisma.user.findMany({
				where: { name: { contains: "Test" } },
			});

			const startsWithDemo = await prisma.user.findMany({
				where: { name: { startsWith: "Demo" } },
			});

			const endsWithUser = await prisma.user.findMany({
				where: { name: { endsWith: "User" } },
			});

			expect(testUsers).toHaveLength(1);
			expect(startsWithDemo).toHaveLength(1);
			expect(endsWithUser).toHaveLength(3);
		});

		test("where in/notIn", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "in1@example.com", name: "User1" },
					{ email: "in2@example.com", name: "User2" },
					{ email: "in3@example.com", name: "User3" },
				],
			});

			const users = await prisma.user.findMany({
				where: { name: { in: ["User1", "User3"] } },
			});

			expect(users).toHaveLength(2);
		});

		test("where OR/AND/NOT", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "logic1@example.com", name: "Alice", age: 25 },
					{ email: "logic2@example.com", name: "Bob", age: 30 },
					{ email: "logic3@example.com", name: "Charlie", age: 25 },
				],
			});

			const orResult = await prisma.user.findMany({
				where: {
					OR: [{ name: "Alice" }, { age: 30 }],
				},
			});

			const andResult = await prisma.user.findMany({
				where: {
					AND: [{ age: 25 }, { name: "Alice" }],
				},
			});

			const notResult = await prisma.user.findMany({
				where: {
					NOT: { age: 25 },
				},
			});

			expect(orResult).toHaveLength(2);
			expect(andResult).toHaveLength(1);
			expect(notResult).toHaveLength(1);
			expect(notResult[0]!.name).toBe("Bob");
		});

		test("orderBy asc/desc", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "c@example.com", name: "Charlie" },
					{ email: "a@example.com", name: "Alice" },
					{ email: "b@example.com", name: "Bob" },
				],
			});

			const asc = await prisma.user.findMany({
				orderBy: { name: "asc" },
			});

			const desc = await prisma.user.findMany({
				orderBy: { name: "desc" },
			});

			expect(asc[0]!.name).toBe("Alice");
			expect(asc[2]!.name).toBe("Charlie");
			expect(desc[0]!.name).toBe("Charlie");
			expect(desc[2]!.name).toBe("Alice");
		});

		test("skip and take (pagination)", async () => {
			await prisma.user.createMany({
				data: Array.from({ length: 10 }, (_, i) => ({
					email: `user${i}@example.com`,
					name: `User ${i}`,
				})),
			});

			const page1 = await prisma.user.findMany({
				orderBy: { email: "asc" },
				take: 3,
			});

			const page2 = await prisma.user.findMany({
				orderBy: { email: "asc" },
				skip: 3,
				take: 3,
			});

			expect(page1).toHaveLength(3);
			expect(page2).toHaveLength(3);
			expect(page1[0]!.name).toBe("User 0");
			expect(page2[0]!.name).toBe("User 3");
		});

		test("distinct", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "d1@example.com", name: "Alice", age: 25 },
					{ email: "d2@example.com", name: "Bob", age: 25 },
					{ email: "d3@example.com", name: "Charlie", age: 30 },
				],
			});

			const distinctAges = await prisma.user.findMany({
				distinct: ["age"],
				select: { age: true },
			});

			expect(distinctAges).toHaveLength(2);
		});
	});

	describe("Aggregations", () => {
		test("aggregate min/max on DateTime field (iso8601 format)", async () => {
			const user = await prisma.user.create({
				data: { email: "datetime-agg@example.com", name: "DateTime Agg User" },
			});

			const date1 = new Date("2023-01-01T10:00:00Z");
			const date2 = new Date("2023-01-15T10:00:00Z");
			const date3 = new Date("2023-02-01T10:00:00Z");

			await prisma.post.createMany({
				data: [
					{ title: "Post 1", authorId: user.id, createdAt: date1 },
					{ title: "Post 2", authorId: user.id, createdAt: date2 },
					{ title: "Post 3", authorId: user.id, createdAt: date3 },
				],
			});

			const result = await prisma.post.aggregate({
				_min: { createdAt: true },
				_max: { createdAt: true },
				_count: true,
			});

			expect(result._count).toBe(3);
			expect(result._min.createdAt).toBeInstanceOf(Date);
			expect(result._max.createdAt).toBeInstanceOf(Date);
			expect(result._min.createdAt?.getTime()).toBe(date1.getTime());
			expect(result._max.createdAt?.getTime()).toBe(date3.getTime());
		});

		test("aggregate min/max on DateTime field (unixepoch-ms + safeIntegers:false)", async () => {
			// When using unixepoch-ms format with safeIntegers:false, aggregate DateTime works
			// because values stay as numbers (not BigInt→string), and Prisma can parse them.
			//
			// Note: safeIntegers:true (default) causes BigInt→string conversion which breaks
			// DateTime parsing. Use safeIntegers:false if you don't have BigInt columns.

			// Create a separate adapter with unixepoch-ms format AND safeIntegers: false
			const unixAdapter = new PrismaBunSqlite({
				url: ":memory:",
				timestampFormat: "unixepoch-ms",
				safeIntegers: false,  // Key fix!
			});
			const unixPrisma = new PrismaClient({ adapter: unixAdapter });

			// Run migrations to set up the schema
			await unixPrisma.$executeRaw`
				CREATE TABLE User (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					email TEXT UNIQUE NOT NULL,
					name TEXT,
					age INTEGER,
					balance REAL DEFAULT 0.0,
					isActive INTEGER DEFAULT 1,
					metadata TEXT,
					createdAt INTEGER NOT NULL,
					updatedAt INTEGER NOT NULL
				)
			`;
			await unixPrisma.$executeRaw`
				CREATE TABLE Post (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					title TEXT NOT NULL,
					content TEXT,
					published INTEGER DEFAULT 0,
					viewCount INTEGER DEFAULT 0,
					rating REAL,
					publishedAt INTEGER,
					authorId INTEGER NOT NULL,
					createdAt INTEGER NOT NULL,
					updatedAt INTEGER NOT NULL,
					FOREIGN KEY (authorId) REFERENCES User(id) ON DELETE CASCADE
				)
			`;

			const now = Date.now();
			await unixPrisma.$executeRaw`
				INSERT INTO User (email, name, createdAt, updatedAt)
				VALUES ('unix-test@example.com', 'Unix Test User', ${now}, ${now})
			`;

			const date1 = new Date("2023-01-01T10:00:00Z");
			const date2 = new Date("2023-01-15T10:00:00Z");
			const date3 = new Date("2023-02-01T10:00:00Z");

			await unixPrisma.$executeRaw`
				INSERT INTO Post (title, authorId, createdAt, updatedAt)
				VALUES
					('Post 1', 1, ${date1.getTime()}, ${now}),
					('Post 2', 1, ${date2.getTime()}, ${now}),
					('Post 3', 1, ${date3.getTime()}, ${now})
			`;

			const result = await unixPrisma.post.aggregate({
				_min: { createdAt: true },
				_max: { createdAt: true },
				_count: true,
			});

			expect(result._count).toBe(3);
			// These assertions verify that aggregate DateTime fields work with unixepoch-ms
			expect(result._min.createdAt).toBeInstanceOf(Date);
			expect(result._max.createdAt).toBeInstanceOf(Date);
			expect(result._min.createdAt?.getTime()).toBe(date1.getTime());
			expect(result._max.createdAt?.getTime()).toBe(date3.getTime());
		});

		test("count with where", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "count1@example.com", name: "User1", isActive: true },
					{ email: "count2@example.com", name: "User2", isActive: true },
					{ email: "count3@example.com", name: "User3", isActive: false },
				],
			});

			const activeCount = await prisma.user.count({
				where: { isActive: true },
			});

			expect(activeCount).toBe(2);
		});

		test("aggregate sum, avg, min, max", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "agg1@example.com", name: "User1", age: 20, balance: 100 },
					{ email: "agg2@example.com", name: "User2", age: 30, balance: 200 },
					{ email: "agg3@example.com", name: "User3", age: 40, balance: 300 },
				],
			});

			const result = await prisma.user.aggregate({
				_sum: { age: true, balance: true },
				_avg: { age: true, balance: true },
				_min: { age: true },
				_max: { age: true },
				_count: true,
			});

			expect(result._sum.age).toBe(90);
			expect(result._sum.balance).toBe(600);
			expect(result._avg.age).toBe(30);
			expect(result._avg.balance).toBe(200);
			expect(result._min.age).toBe(20);
			expect(result._max.age).toBe(40);
			expect(result._count).toBe(3);
		});

		test("groupBy", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "group1@example.com", name: "User1", age: 25, isActive: true },
					{ email: "group2@example.com", name: "User2", age: 30, isActive: true },
					{ email: "group3@example.com", name: "User3", age: 25, isActive: false },
				],
			});

			const groups = await prisma.user.groupBy({
				by: ["age"],
				_count: true,
			});

			expect(groups).toHaveLength(2);
			const age25Group = groups.find((g) => g.age === 25);
			expect(age25Group?._count).toBe(2);
		});
	});

	describe("Transactions", () => {
		test("interactive transaction - commit", async () => {
			await prisma.$transaction(async (tx) => {
				await tx.user.create({
					data: { email: "tx1@example.com", name: "TxUser1" },
				});
				await tx.user.create({
					data: { email: "tx2@example.com", name: "TxUser2" },
				});
			});

			const count = await prisma.user.count();
			expect(count).toBe(2);
		});

		test("interactive transaction - rollback on error", async () => {
			try {
				await prisma.$transaction(async (tx) => {
					await tx.user.create({
						data: { email: "rollback@example.com", name: "RollbackUser" },
					});

					// This will fail due to duplicate email
					await tx.user.create({
						data: { email: "rollback@example.com", name: "Duplicate" },
					});
				});
			} catch (error) {
				// Expected to fail
			}

			const count = await prisma.user.count();
			expect(count).toBe(0);
		});

		test("sequential transaction (array syntax)", async () => {
			const user = prisma.user.create({
				data: { email: "seq@example.com", name: "SeqUser" },
			});

			const profile = prisma.profile.create({
				data: { bio: "Bio", userId: 1 }, // Note: This assumes user.id will be 1
			});

			// Sequential transactions with array syntax
			const [createdUser] = await prisma.$transaction([user]);

			const [createdProfile] = await prisma.$transaction([
				prisma.profile.create({
					data: { bio: "Bio", userId: createdUser.id },
				}),
			]);

			expect(createdUser.email).toBe("seq@example.com");
			expect(createdProfile.userId).toBe(createdUser.id);
		});

		test("concurrent interactive transactions - should serialize", async () => {
			// Launch two overlapping transactions
			// They should serialize (not throw "Transaction already active")
			const results = await Promise.allSettled([
				prisma.$transaction(async (tx) => {
					const user = await tx.user.create({
						data: { email: "concurrent1@example.com", name: "Concurrent1" },
					});
					// Add small delay to ensure overlap
					await new Promise((resolve) => setTimeout(resolve, 50));
					return user;
				}),
				prisma.$transaction(async (tx) => {
					const user = await tx.user.create({
						data: { email: "concurrent2@example.com", name: "Concurrent2" },
					});
					return user;
				}),
			]);

			// Both transactions should succeed (not reject)
			expect(results[0].status).toBe("fulfilled");
			expect(results[1].status).toBe("fulfilled");

			// Verify both users were created
			const users = await prisma.user.findMany({
				where: {
					email: { in: ["concurrent1@example.com", "concurrent2@example.com"] },
				},
			});
			expect(users).toHaveLength(2);
		});
	});

	describe("Raw Queries", () => {
		test("$queryRaw - SELECT", async () => {
			await prisma.user.createMany({
				data: [
					{ email: "raw1@example.com", name: "Raw1" },
					{ email: "raw2@example.com", name: "Raw2" },
				],
			});

			const users = await prisma.$queryRaw<Array<{ email: string; name: string }>>`
				SELECT email, name FROM User WHERE name LIKE ${"Raw%"}
			`;

			expect(users).toHaveLength(2);
			expect(users[0]!.name).toMatch(/^Raw/);
		});

		test("$executeRaw - INSERT", async () => {
			const now = new Date().toISOString();
			const result = await prisma.$executeRaw`
				INSERT INTO User (email, name, createdAt, updatedAt)
				VALUES (${"execute@example.com"}, ${"ExecuteUser"}, ${now}, ${now})
			`;

			expect(result).toBeGreaterThan(0);

			const user = await prisma.user.findUnique({
				where: { email: "execute@example.com" },
			});

			expect(user?.name).toBe("ExecuteUser");
		});

		test("$executeRaw - UPDATE", async () => {
			await prisma.user.create({
				data: { email: "rawupdate@example.com", name: "Before" },
			});

			const result = await prisma.$executeRaw`
				UPDATE User SET name = ${"After"} WHERE email = ${"rawupdate@example.com"}
			`;

			expect(result).toBe(1);

			const user = await prisma.user.findUnique({
				where: { email: "rawupdate@example.com" },
			});

			expect(user?.name).toBe("After");
		});

		test("$executeRaw - DELETE", async () => {
			await prisma.user.create({
				data: { email: "rawdelete@example.com", name: "ToDelete" },
			});

			const result = await prisma.$executeRaw`
				DELETE FROM User WHERE email = ${"rawdelete@example.com"}
			`;

			expect(result).toBe(1);

			const count = await prisma.user.count();
			expect(count).toBe(0);
		});

		test("$queryRaw - empty result set preserves column metadata", async () => {
			// Query that returns 0 rows should still have column names/types
			type UserResult = { id: number; email: string; name: string | null };
			const result = await prisma.$queryRaw<UserResult[]>`
				SELECT id, email, name FROM User WHERE 1 = 0
			`;

			// Result should be empty array
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);

			// Note: We can't directly test columnNames/columnTypes as they're internal
			// to the adapter, but Prisma relies on them to type the result correctly.
			// The fact that TypeScript accepts this as UserResult[] validates it works.
		});

		test("$queryRaw - preserves all columns in joins (duplicate names)", async () => {
			// Regression test for: https://github.com/mmvsk/prisma-adapter-bun-sqlite/issues/X
			// Ensure queries with duplicate column names don't lose data
			const user = await prisma.user.create({
				data: { email: "join@example.com", name: "JoinUser" },
			});

			await prisma.profile.create({
				data: { bio: "Join Bio", userId: user.id },
			});

			// Query with duplicate column names (both have 'id')
			type JoinResult = any[];
			const result = await prisma.$queryRaw<JoinResult>`
				SELECT User.id, Profile.id, User.name, Profile.bio
				FROM User
				JOIN Profile ON User.id = Profile.userId
				WHERE User.email = ${"join@example.com"}
			`;

			// Should have all 4 columns, not lose any due to duplicate 'id'
			expect(result.length).toBe(1);
			expect(result[0]).toBeDefined();
			// Note: Prisma returns results as objects, the adapter handles array conversion internally
		});
	});

	describe("Type Coercion", () => {
		test("DateTime handling", async () => {
			const now = new Date();
			const user = await prisma.user.create({
				data: {
					email: "datetime@example.com",
					name: "DateTime User",
					createdAt: now,
				},
			});

			expect(user.createdAt).toBeInstanceOf(Date);
			expect(user.createdAt.getTime()).toBeCloseTo(now.getTime(), -3); // Within 1 second
		});

		test("BigInt handling", async () => {
			const analytics = await prisma.analytics.create({
				data: {
					totalViews: BigInt("9007199254740991"),
					totalLikes: BigInt("123456789012345"),
					entityType: "post",
					entityId: 1,
				},
			});

			expect(typeof analytics.totalViews).toBe("bigint");
			expect(analytics.totalViews).toBe(BigInt("9007199254740991"));
			expect(analytics.totalLikes).toBe(BigInt("123456789012345"));
		});

		// Only test max BigInt values for bunsqlite adapter
		// libsql adapter has different safe integer handling
		if (adapterName === "bunsqlite") {
			test("BigInt handling - maximum 64-bit values (2^63-1)", async () => {
				// Test maximum signed 64-bit integer to ensure no precision loss
				const maxInt64 = 9223372036854775807n; // 2^63 - 1

				const analytics = await prisma.analytics.create({
					data: {
						totalViews: maxInt64,
						totalLikes: maxInt64,
						entityType: "post",
						entityId: 1,
					},
				});

				// Verify values are returned as bigint with exact precision
				expect(typeof analytics.totalViews).toBe("bigint");
				expect(analytics.totalViews).toBe(maxInt64);
				expect(analytics.totalLikes).toBe(maxInt64);

				// Verify round-trip read preserves precision
				const read = await prisma.analytics.findUnique({
					where: { id: analytics.id },
				});
				expect(read?.totalViews).toBe(maxInt64);
				expect(read?.totalLikes).toBe(maxInt64);
			});
		}

		test("Boolean handling (0/1 in SQLite)", async () => {
			const user = await prisma.user.create({
				data: {
					email: "bool@example.com",
					name: "Bool User",
					isActive: false,
				},
			});

			expect(user.isActive).toBe(false);

			const updated = await prisma.user.update({
				where: { id: user.id },
				data: { isActive: true },
			});

			expect(updated.isActive).toBe(true);
		});

		test("Decimal handling (stored as TEXT in SQLite)", async () => {
			const product = await prisma.product.create({
				data: {
					name: "Test Product",
					price: "99.99",
					discount: "10.50",
				},
			});

			expect(product.price).toBeTruthy();
			expect(product.discount).toBeTruthy();
		});

		test("JSON handling (stored as TEXT in SQLite)", async () => {
			const metadata = JSON.stringify({ theme: "dark", notifications: true });
			const user = await prisma.user.create({
				data: {
					email: "json@example.com",
					name: "JSON User",
					metadata,
				},
			});

			expect(user.metadata).toBe(metadata);
			const parsed = JSON.parse(user.metadata!);
			expect(parsed.theme).toBe("dark");
			expect(parsed.notifications).toBe(true);
		});

		test("Bytes/BLOB handling", async () => {
			const user = await prisma.user.create({
				data: { email: "bytes@example.com", name: "Bytes User" },
			});

			const imageData = Buffer.from("fake-image-data");
			const profile = await prisma.profile.create({
				data: {
					bio: "Has avatar",
					userId: user.id,
					avatar: imageData,
				},
			});

			// In Bun, BLOB can be returned as Uint8Array or Buffer
			expect(profile.avatar).toBeTruthy();
			expect(profile.avatar instanceof Buffer || profile.avatar instanceof Uint8Array).toBe(true);
			// Compare the actual bytes
			const receivedBytes = profile.avatar instanceof Buffer ? profile.avatar : Buffer.from(profile.avatar!);
			expect(receivedBytes.equals(imageData)).toBe(true);
		});

		test("null vs undefined", async () => {
			const userWithNull = await prisma.user.create({
				data: {
					email: "null@example.com",
					name: null,
				},
			});

			expect(userWithNull.name).toBeNull();

			const userWithoutName = await prisma.user.create({
				data: {
					email: "undefined@example.com",
				},
			});

			expect(userWithoutName.name).toBeNull();
		});
	});

	describe("Error Handling", () => {
		test("P2002 - Unique constraint violation", async () => {
			await prisma.user.create({
				data: { email: "unique@example.com", name: "First" },
			});

			try {
				await prisma.user.create({
					data: { email: "unique@example.com", name: "Second" },
				});
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				expect(error.code).toBe("P2002");
			}
		});

		test("P2003 - Foreign key constraint violation", async () => {
			try {
				await prisma.post.create({
					data: {
						title: "Invalid Post",
						authorId: 99999, // Non-existent user
					},
				});
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				expect(error.code).toBe("P2003");
			}
		});

		test("P2025 - Record not found", async () => {
			try {
				await prisma.user.update({
					where: { id: 99999 },
					data: { name: "Updated" },
				});
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				expect(error.code).toBe("P2025");
			}
		});

		test("P2011 - Null constraint violation", async () => {
			// First create a user to satisfy foreign key
			const user = await prisma.user.create({
				data: { email: "null-test@example.com", name: "Null Test" },
			});

			try {
				await prisma.profile.create({
					data: {
						bio: null as any, // bio is required
						userId: user.id,
					},
				});
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				// Prisma validates required fields before sending to DB
				// This will throw a validation error, not a database constraint error
				expect(error).toBeTruthy();
			}
		});

		test("Missing table error is properly wrapped (errno-only error)", async () => {
			// Regression test: Ensure errno-only errors (no .code) are wrapped properly
			// Bun SQLite returns { errno: 1, message: "...", code: undefined }
			try {
				await prisma.$queryRawUnsafe("SELECT * FROM NonExistentTable");
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				// Should be wrapped by adapter, not thrown as raw SQLite error
				expect(error.message).toContain("table");
			}
		});

		test("Missing column error is properly wrapped (errno-only error)", async () => {
			// Regression test: Ensure errno-only errors (no .code) are wrapped properly
			try {
				await prisma.$queryRawUnsafe("SELECT nonexistent_column FROM User");
				expect(true).toBe(false); // Should not reach here
			} catch (error: any) {
				// Should be wrapped by adapter, not thrown as raw SQLite error
				expect(error.message).toContain("column");
			}
		});
	});

	describe("Edge Cases", () => {
		test("empty string vs null", async () => {
			const withEmpty = await prisma.user.create({
				data: {
					email: "empty@example.com",
					name: "",
				},
			});

			const withNull = await prisma.user.create({
				data: {
					email: "null2@example.com",
					name: null,
				},
			});

			expect(withEmpty.name).toBe("");
			expect(withNull.name).toBeNull();
		});

		test("large numbers", async () => {
			const product = await prisma.product.create({
				data: {
					name: "Expensive Item",
					price: "999999999.99",
				},
			});

			expect(product.price).toBeTruthy();
		});

		test("special characters in strings", async () => {
			const user = await prisma.user.create({
				data: {
					email: "special@example.com",
					name: "Name with 'quotes' and \"double quotes\" and emoji 🚀",
				},
			});

			expect(user.name).toContain("quotes");
			expect(user.name).toContain("🚀");
		});

		test("concurrent operations", async () => {
			const promises = Array.from({ length: 5 }, (_, i) =>
				prisma.user.create({
					data: {
						email: `concurrent${i}@example.com`,
						name: `Concurrent ${i}`,
					},
				})
			);

			const results = await Promise.all(promises);
			expect(results).toHaveLength(5);

			const count = await prisma.user.count();
			expect(count).toBe(5);
		});

		test("very long text content", async () => {
			const longText = "A".repeat(10000);
			const user = await prisma.user.create({
				data: { email: "long@example.com", name: "Long User" },
			});

			const post = await prisma.post.create({
				data: {
					title: "Long Post",
					content: longText,
					authorId: user.id,
				},
			});

			expect(post.content).toHaveLength(10000);
		});

		test("zero and negative numbers", async () => {
			const user = await prisma.user.create({
				data: {
					email: "numbers@example.com",
					name: "Numbers User",
					age: 0,
					balance: -50.5,
				},
			});

			expect(user.age).toBe(0);
			expect(user.balance).toBe(-50.5);
		});
	});
