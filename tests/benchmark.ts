/**
 * Internal benchmark for prisma-adapter-bun-sqlite
 *
 * Usage:
 *   bun run benchmark              # Default: in-memory, key/value output
 *   bun run benchmark --json       # JSON to stdout
 *   bun run benchmark --json results.json  # JSON to file
 *   bun run benchmark --fs         # File-based database
 *   bun run benchmark --fs /tmp/bench  # Custom directory
 */

import { PrismaClient } from "../prisma/generated/client.js";
import { PrismaBunSqlite } from "../src/index.js";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

// =============================================================================
// Types
// =============================================================================

interface BenchmarkTest {
	name: string;
	category: string;
	iterations: number;
	setup?: (prisma: PrismaClient) => Promise<void>;
	run: (prisma: PrismaClient) => Promise<void>;
}

interface BenchmarkResult {
	category: string;
	name: string;
	iterations: number;
	totalTime: number;
	avgTime: number;
	opsPerSecond: number;
	passed: boolean;
	error?: string;
}

interface BenchmarkOutput {
	timestamp: string;
	version: string;
	mode: string;
	results: BenchmarkResult[];
	summary: {
		total: number;
		passed: number;
		failed: number;
		avgOpsPerSecond: number;
	};
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const args = process.argv.slice(2);

const jsonArgIndex = args.indexOf("--json");
const outputJson = jsonArgIndex !== -1;
const jsonOutputFile =
	jsonArgIndex !== -1 &&
	args[jsonArgIndex + 1] &&
	!args[jsonArgIndex + 1]!.startsWith("--")
		? args[jsonArgIndex + 1]
		: undefined;

const fsArgIndex = args.indexOf("--fs");
const useFs = fsArgIndex !== -1;
const fsDir =
	useFs && args[fsArgIndex + 1] && !args[fsArgIndex + 1]!.startsWith("--")
		? args[fsArgIndex + 1]
		: undefined;

const runsArgIndex = args.indexOf("--runs");
const runsArg =
	runsArgIndex !== -1 &&
	args[runsArgIndex + 1] &&
	!args[runsArgIndex + 1]!.startsWith("--")
		? parseInt(args[runsArgIndex + 1]!, 10)
		: undefined;

const prettyNumbers = args.includes("--pretty");

// Show help if requested
if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: bun run benchmark [options]

Options:
  --json [file]     Output as JSON (optionally to a file)
  --fs [dir]        Use file-based database instead of :memory:
  --runs N          Number of benchmark runs (default: 3, keeps best result)
  --pretty          Format numbers with k suffix (e.g., 1.2k instead of 1234)
  --help, -h        Show this help message

Examples:
  bun run benchmark                    # In-memory, 3 runs, exact numbers
  bun run benchmark --pretty           # Format large numbers (1.2k)
  bun run benchmark --runs 5           # 5 runs for more stable results
  bun run benchmark --json             # JSON to stdout
  bun run benchmark --json out.json    # JSON to file
  bun run benchmark --fs               # File-based in ./tests/data/
`);
	process.exit(0);
}

// =============================================================================
// Test Definitions
// =============================================================================

const benchmarkTests: BenchmarkTest[] = [
	// ==================== CRUD Operations ====================
	{
		name: "Create single user",
		category: "CRUD Operations",
		iterations: 100,
		run: async (prisma) => {
			await prisma.user.create({
				data: {
					email: `user_${Date.now()}_${Math.random()}@test.com`,
					name: "Test User",
					isActive: true,
				},
			});
		},
	},

	{
		name: "Create user with profile",
		category: "CRUD Operations",
		iterations: 50,
		run: async (prisma) => {
			await prisma.user.create({
				data: {
					email: `user_${Date.now()}_${Math.random()}@test.com`,
					name: "Test User",
					profile: {
						create: { bio: "Test bio" },
					},
				},
			});
		},
	},

	{
		name: "Bulk create users",
		category: "CRUD Operations",
		iterations: 20,
		run: async (prisma) => {
			const users = Array.from({ length: 10 }, (_, i) => ({
				email: `bulk_${Date.now()}_${i}_${Math.random()}@test.com`,
				name: `User ${i}`,
				isActive: i % 2 === 0,
			}));
			await prisma.user.createMany({ data: users });
		},
	},

	{
		name: "Find all users",
		category: "CRUD Operations",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 100 }, (_, i) => ({
					email: `setup_${i}@test.com`,
					name: `User ${i}`,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.findMany();
		},
	},

	{
		name: "Find user by ID",
		category: "CRUD Operations",
		iterations: 200,
		setup: async (prisma) => {
			await prisma.user.create({
				data: { email: "findme@test.com", name: "Find Me" },
			});
		},
		run: async (prisma) => {
			await prisma.user.findUnique({ where: { id: 1 } });
		},
	},

	{
		name: "Update user",
		category: "CRUD Operations",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.create({
				data: { email: "update@test.com", name: "Original" },
			});
		},
		run: async (prisma) => {
			const user = await prisma.user.findFirst({ where: { email: "update@test.com" } });
			if (user) {
				await prisma.user.update({
					where: { id: user.id },
					data: { name: "Updated" },
				});
			}
		},
	},

	{
		name: "Delete user",
		category: "CRUD Operations",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 110 }, (_, i) => ({
					email: `delete_${i}@test.com`,
					name: `Delete User ${i}`,
				})),
			});
		},
		run: async (prisma) => {
			const user = await prisma.user.findFirst({ where: { email: { startsWith: "delete_" } } });
			if (user) {
				await prisma.user.delete({ where: { id: user.id } });
			}
		},
	},

	// ==================== Relations & JOINs ====================
	{
		name: "Find users with profiles (1-to-1)",
		category: "Relations & JOINs",
		iterations: 50,
		setup: async (prisma) => {
			for (let i = 0; i < 20; i++) {
				await prisma.user.create({
					data: {
						email: `join_${i}@test.com`,
						name: `User ${i}`,
						profile: { create: { bio: `Bio ${i}` } },
					},
				});
			}
		},
		run: async (prisma) => {
			await prisma.user.findMany({ include: { profile: true } });
		},
	},

	{
		name: "Find users with posts (1-to-many)",
		category: "Relations & JOINs",
		iterations: 50,
		setup: async (prisma) => {
			for (let i = 0; i < 10; i++) {
				await prisma.user.create({
					data: {
						email: `author_${i}@test.com`,
						name: `Author ${i}`,
						posts: {
							create: [
								{ title: "Post 1", content: "Content 1" },
								{ title: "Post 2", content: "Content 2" },
							],
						},
					},
				});
			}
		},
		run: async (prisma) => {
			await prisma.user.findMany({ include: { posts: true } });
		},
	},

	{
		name: "Nested create (user + profile + posts)",
		category: "Relations & JOINs",
		iterations: 20,
		run: async (prisma) => {
			await prisma.user.create({
				data: {
					email: `nested_${Date.now()}_${Math.random()}@test.com`,
					name: "Nested User",
					profile: { create: { bio: "Nested bio" } },
					posts: {
						create: [
							{ title: "Post 1", content: "Content 1" },
							{ title: "Post 2", content: "Content 2" },
						],
					},
				},
			});
		},
	},

	{
		name: "Cascade delete",
		category: "Relations & JOINs",
		iterations: 10,
		setup: async (prisma) => {
			await prisma.user.create({
				data: {
					email: "cascade@test.com",
					name: "Cascade User",
					profile: { create: { bio: "Will be deleted" } },
					posts: { create: [{ title: "Post 1" }, { title: "Post 2" }] },
				},
			});
		},
		run: async (prisma) => {
			await prisma.user.delete({ where: { email: "cascade@test.com" } });
			await prisma.user.create({
				data: {
					email: "cascade@test.com",
					name: "Cascade User",
					profile: { create: { bio: "Will be deleted" } },
					posts: { create: [{ title: "Post 1" }, { title: "Post 2" }] },
				},
			});
		},
	},

	// ==================== Filtering & Querying ====================
	{
		name: "Filter by boolean",
		category: "Filtering & Querying",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 100 }, (_, i) => ({
					email: `bool_${i}@test.com`,
					name: `User ${i}`,
					isActive: i % 2 === 0,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.findMany({ where: { isActive: true } });
		},
	},

	{
		name: "Filter by date",
		category: "Filtering & Querying",
		iterations: 50,
		setup: async (prisma) => {
			const now = new Date();
			await prisma.user.createMany({
				data: Array.from({ length: 50 }, (_, i) => ({
					email: `date_${i}@test.com`,
					name: `User ${i}`,
					createdAt: new Date(now.getTime() - i * 86400000),
				})),
			});
		},
		run: async (prisma) => {
			const yesterday = new Date(Date.now() - 86400000);
			await prisma.user.findMany({ where: { createdAt: { gt: yesterday } } });
		},
	},

	{
		name: "Order by + pagination",
		category: "Filtering & Querying",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 100 }, (_, i) => ({
					email: `page_${i}@test.com`,
					name: `User ${i}`,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.findMany({
				orderBy: { id: "desc" },
				take: 10,
				skip: 20,
			});
		},
	},

	{
		name: "Complex where (AND/OR)",
		category: "Filtering & Querying",
		iterations: 50,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 100 }, (_, i) => ({
					email: `complex_${i}@test.com`,
					name: i % 3 === 0 ? "Alice" : i % 3 === 1 ? "Bob" : "Charlie",
					isActive: i % 2 === 0,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.findMany({
				where: {
					AND: [
						{ isActive: true },
						{ OR: [{ name: { contains: "Ali" } }, { name: { contains: "Bob" } }] },
					],
				},
			});
		},
	},

	// ==================== Type Coercion ====================
	{
		name: "BigInt handling",
		category: "Type Coercion",
		iterations: 50,
		run: async (prisma) => {
			await prisma.analytics.create({
				data: {
					entityType: "user",
					entityId: Math.floor(Math.random() * 1000000),
					totalViews: BigInt("9007199254740991"),
					totalLikes: BigInt("1234567890123456789"),
				},
			});
		},
	},

	{
		name: "Decimal handling",
		category: "Type Coercion",
		iterations: 50,
		run: async (prisma) => {
			await prisma.product.create({
				data: {
					name: `Product ${Date.now()}`,
					price: 123.456789,
					discount: 0.15,
				},
			});
		},
	},

	{
		name: "Bytes handling (BLOB)",
		category: "Type Coercion",
		iterations: 30,
		run: async (prisma) => {
			const buffer = Buffer.from("Hello, World!", "utf-8");
			await prisma.user.create({
				data: {
					email: `bytes_${Date.now()}_${Math.random()}@test.com`,
					name: "Bytes User",
					profile: {
						create: { bio: "Has avatar", avatar: buffer },
					},
				},
			});
		},
	},

	// ==================== Transactions ====================
	{
		name: "Transaction commit",
		category: "Transactions",
		iterations: 20,
		run: async (prisma) => {
			await prisma.$transaction(async (tx) => {
				await tx.user.create({
					data: {
						email: `tx_${Date.now()}_${Math.random()}@test.com`,
						name: "TX User",
					},
				});
				await tx.user.create({
					data: {
						email: `tx2_${Date.now()}_${Math.random()}@test.com`,
						name: "TX User 2",
					},
				});
			});
		},
	},

	{
		name: "Transaction rollback",
		category: "Transactions",
		iterations: 20,
		run: async (prisma) => {
			try {
				await prisma.$transaction(async (tx) => {
					await tx.user.create({
						data: {
							email: `rollback_${Date.now()}_${Math.random()}@test.com`,
							name: "Rollback User",
						},
					});
					throw new Error("Intentional rollback");
				});
			} catch {
				// Expected to fail
			}
		},
	},

	// ==================== Aggregations ====================
	{
		name: "Count",
		category: "Aggregations",
		iterations: 100,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 100 }, (_, i) => ({
					email: `count_${i}@test.com`,
					name: `User ${i}`,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.count();
		},
	},

	{
		name: "Aggregate (avg, sum, min, max)",
		category: "Aggregations",
		iterations: 50,
		setup: async (prisma) => {
			await prisma.user.createMany({
				data: Array.from({ length: 50 }, (_, i) => ({
					email: `agg_${i}@test.com`,
					name: `User ${i}`,
					balance: i * 10.5,
				})),
			});
		},
		run: async (prisma) => {
			await prisma.user.aggregate({
				_avg: { balance: true },
				_sum: { balance: true },
				_min: { balance: true },
				_max: { balance: true },
			});
		},
	},
];

// =============================================================================
// Runner Logic
// =============================================================================

function getDataDir(): string {
	if (fsDir) return resolve(fsDir);
	return resolve(dirname(import.meta.dir), "tests", "data");
}

function getDbPath(): string {
	if (!useFs) return ":memory:";
	return resolve(getDataDir(), "benchmark.db");
}

async function createPrismaClient(): Promise<PrismaClient> {
	const dbPath = getDbPath();

	// Clean up existing file if using fs
	if (useFs) {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(getDataDir(), { recursive: true });
		try {
			const { unlink } = await import("node:fs/promises");
			await unlink(dbPath);
		} catch {
			// File doesn't exist, that's fine
		}
	}

	// Create adapter using the factory class
	const adapter = new PrismaBunSqlite({
		url: dbPath === ":memory:" ? ":memory:" : `file:${dbPath}`,
	});

	const prisma = new PrismaClient({ adapter });

	// Run migrations to set up schema using raw SQL
	await runMigrations(prisma);

	return prisma;
}

async function runMigrations(prisma: PrismaClient): Promise<void> {
	// Read and execute migration SQL
	const migrationsDir = resolve(dirname(import.meta.dir), "prisma", "migrations");
	const { readdir } = await import("node:fs/promises");

	const dirs = await readdir(migrationsDir, { withFileTypes: true });
	const migrationDirs = dirs
		.filter((d) => d.isDirectory() && !d.name.startsWith("_"))
		.sort((a, b) => a.name.localeCompare(b.name));

	for (const dir of migrationDirs) {
		const sqlPath = resolve(migrationsDir, dir.name, "migration.sql");
		try {
			const sql = readFileSync(sqlPath, "utf-8");
			// Execute each statement separately
			const statements = sql
				.split(";")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			for (const stmt of statements) {
				try {
					await prisma.$executeRawUnsafe(stmt);
				} catch {
					// Ignore errors (table already exists, etc.)
				}
			}
		} catch {
			// Migration file doesn't exist, skip
		}
	}
}

async function cleanDatabase(prisma: PrismaClient): Promise<void> {
	// Clean in correct order (respect foreign keys)
	await prisma.$executeRaw`DELETE FROM Comment`;
	await prisma.$executeRaw`DELETE FROM _PostToTag`;
	await prisma.$executeRaw`DELETE FROM Post`;
	await prisma.$executeRaw`DELETE FROM Profile`;
	await prisma.$executeRaw`DELETE FROM Tag`;
	await prisma.$executeRaw`DELETE FROM Analytics`;
	await prisma.$executeRaw`DELETE FROM Product`;
	await prisma.$executeRaw`DELETE FROM Settings`;
	await prisma.$executeRaw`DELETE FROM User`;
}

async function runTest(prisma: PrismaClient, test: BenchmarkTest): Promise<BenchmarkResult> {
	try {
		// Clean database
		await cleanDatabase(prisma);

		// Run setup if provided
		if (test.setup) {
			await test.setup(prisma);
		}

		// Warm-up run
		await test.run(prisma);

		// Benchmark runs
		const startTime = performance.now();

		for (let i = 0; i < test.iterations; i++) {
			await test.run(prisma);
		}

		const endTime = performance.now();
		const totalTime = endTime - startTime;
		const avgTime = totalTime / test.iterations;
		const opsPerSecond = 1000 / avgTime;

		return {
			category: test.category,
			name: test.name,
			iterations: test.iterations,
			totalTime,
			avgTime,
			opsPerSecond,
			passed: true,
		};
	} catch (error) {
		return {
			category: test.category,
			name: test.name,
			iterations: test.iterations,
			totalTime: 0,
			avgTime: 0,
			opsPerSecond: 0,
			passed: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// =============================================================================
// Output Formatters
// =============================================================================

function getVersion(): string {
	try {
		const pkg = JSON.parse(
			readFileSync(resolve(dirname(import.meta.dir), "package.json"), "utf-8")
		);
		return pkg.version || "unknown";
	} catch {
		return "unknown";
	}
}

function formatOpsPerSec(ops: number): string {
	if (prettyNumbers && ops >= 1000) {
		return `${(ops / 1000).toFixed(1)}k`;
	}
	return ops.toFixed(0);
}

function printConsoleOutput(results: BenchmarkResult[]): void {
	const mode = useFs ? `file (${getDbPath()})` : "memory";

	console.log("\nBenchmark Results");
	console.log("=================");
	console.log(`Version: ${getVersion()}`);
	console.log(`Mode: ${mode}`);
	console.log(`Bun: ${Bun.version}`);
	console.log("");

	// Group by category
	const categories = [...new Set(results.map((r) => r.category))];

	for (const category of categories) {
		console.log(`${category}:`);
		const categoryResults = results.filter((r) => r.category === category);

		for (const result of categoryResults) {
			const status = result.passed ? " " : "!";
			const ops = result.passed ? `${formatOpsPerSec(result.opsPerSecond)} ops/sec` : "FAILED";
			const error = result.error ? ` (${result.error.substring(0, 40)}...)` : "";
			console.log(`  ${status} ${result.name.padEnd(35)} ${ops.padStart(12)}${error}`);
		}
		console.log("");
	}

	// Summary
	const passed = results.filter((r) => r.passed);
	const failed = results.filter((r) => !r.passed);
	const avgOps =
		passed.length > 0 ? passed.reduce((sum, r) => sum + r.opsPerSecond, 0) / passed.length : 0;

	console.log("Summary:");
	console.log(
		`  Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length} | Avg: ${formatOpsPerSec(avgOps)} ops/sec`
	);

	if (failed.length > 0) {
		console.log("\nFailed tests:");
		for (const result of failed) {
			console.log(`  - ${result.name}: ${result.error}`);
		}
	}
}

function buildJsonOutput(results: BenchmarkResult[]): BenchmarkOutput {
	const passed = results.filter((r) => r.passed);
	const failed = results.filter((r) => !r.passed);
	const avgOps =
		passed.length > 0 ? passed.reduce((sum, r) => sum + r.opsPerSecond, 0) / passed.length : 0;

	return {
		timestamp: new Date().toISOString(),
		version: getVersion(),
		mode: useFs ? "file" : "memory",
		results,
		summary: {
			total: results.length,
			passed: passed.length,
			failed: failed.length,
			avgOpsPerSecond: Math.round(avgOps),
		},
	};
}

// =============================================================================
// Main
// =============================================================================

// Number of runs to perform (keeps best result to reduce noise)
const BENCHMARK_RUNS = runsArg && runsArg > 0 ? runsArg : 3;

function mergeResults(runs: BenchmarkResult[][]): BenchmarkResult[] {
	// Keep the highest ops/sec for each test across all runs
	const bestByTest = new Map<string, BenchmarkResult>();

	for (const run of runs) {
		for (const result of run) {
			const existing = bestByTest.get(result.name);
			if (!existing || result.opsPerSecond > existing.opsPerSecond) {
				bestByTest.set(result.name, result);
			}
		}
	}

	// Return in original order
	const testNames = runs[0]?.map((r) => r.name) ?? [];
	return testNames.map((name) => bestByTest.get(name)!).filter(Boolean);
}

async function main(): Promise<void> {
	// Create client
	const prisma = await createPrismaClient();

	try {
		// Phase 1: Full JIT warmup (run ALL tests silently)
		if (!outputJson) {
			console.log("Warming up JIT (full pass)...");
		}
		for (const test of benchmarkTests) {
			await runTest(prisma, test);
		}

		// Phase 2: Run multiple times and keep best results
		const allRuns: BenchmarkResult[][] = [];

		for (let run = 1; run <= BENCHMARK_RUNS; run++) {
			if (!outputJson) {
				process.stdout.write(`Run ${run}/${BENCHMARK_RUNS} `);
			}

			const runResults: BenchmarkResult[] = [];

			for (const test of benchmarkTests) {
				const result = await runTest(prisma, test);
				runResults.push(result);

				// Show progress for console output
				if (!outputJson) {
					const status = result.passed ? "." : "!";
					process.stdout.write(status);
				}
			}

			if (!outputJson) {
				console.log();
			}

			allRuns.push(runResults);
		}

		if (!outputJson) {
			console.log();
		}

		// Phase 3: Merge results (keep highest ops/sec for each test)
		const results = mergeResults(allRuns);

		// Output results
		if (outputJson) {
			const output = buildJsonOutput(results);
			const jsonStr = JSON.stringify(output, null, 2);

			if (jsonOutputFile) {
				const { writeFile } = await import("node:fs/promises");
				await writeFile(jsonOutputFile, jsonStr);
			} else {
				console.log(jsonStr);
			}
		} else {
			printConsoleOutput(results);
		}

		// Exit with error code if any tests failed
		const failed = results.filter((r) => !r.passed);
		if (failed.length > 0) {
			process.exit(1);
		}
	} finally {
		await prisma.$disconnect();
	}
}

if (import.meta.main) {
	await main();
}
