/**
 * Example: Bundle Prisma migration files into a standalone binary
 *
 * This approach:
 * 1. Reads migration SQL files from prisma/migrations/
 * 2. Embeds them as strings at build time
 * 3. Applies them programmatically at runtime
 * 4. Creates a single binary with NO node_modules needed
 *
 * Build: bun build --compile ./examples/bundle-with-migration-files.ts --outfile myapp
 * Run: ./myapp
 */

import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load migrations from prisma/migrations/ directory
 * This runs at BUILD time, so migration files are embedded in the binary
 */
function loadMigrations() {
  const migrationsDir = new URL("../prisma/migrations", import.meta.url)
    .pathname;

  try {
    const migrationDirs = readdirSync(migrationsDir).filter((name) =>
      // Skip _baseline and other special folders
      !name.startsWith("_")
    );

    const migrations = migrationDirs
      .map((dir) => {
        const sqlFile = join(migrationsDir, dir, "migration.sql");
        try {
          const sql = readFileSync(sqlFile, "utf-8");
          return {
            name: dir, // e.g., "20241120_init"
            sql,
          };
        } catch {
          console.warn(`⚠️  No migration.sql found in ${dir}`);
          return null;
        }
      })
      .filter(Boolean);

    return migrations;
  } catch (error) {
    console.warn(
      "⚠️  No migrations directory found, will create empty database"
    );
    return [];
  }
}

// Load migrations at build time - they'll be embedded in the binary!
const EMBEDDED_MIGRATIONS = loadMigrations();

console.log(`📦 Embedded ${EMBEDDED_MIGRATIONS.length} migrations in binary`);

/**
 * Apply migrations to the database
 */
async function applyMigrations(adapter: any) {
  if (EMBEDDED_MIGRATIONS.length === 0) {
    console.log("ℹ️  No migrations to apply");
    return;
  }

  console.log(`\n🔄 Applying ${EMBEDDED_MIGRATIONS.length} migrations...\n`);

  // Create migration tracking table (Prisma-compatible)
  await adapter.executeScript(`
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
  `);

  const db = (adapter as any).db;

  for (const migration of EMBEDDED_MIGRATIONS) {
    // Check if already applied
    const existing = db
      .prepare("SELECT id FROM _prisma_migrations WHERE migration_name = ?")
      .get(migration.name);

    if (existing) {
      console.log(`⏭️  ${migration.name} (already applied)`);
      continue;
    }

    console.log(`▶️  ${migration.name}...`);

    try {
      const startTime = Date.now();

      // Apply migration
      await adapter.executeScript(migration.sql);

      // Record migration (Prisma-compatible format)
      const id = crypto.randomUUID();
      const checksum = await Bun.hash(migration.sql).toString(); // Simple checksum

      db.prepare(`
        INSERT INTO _prisma_migrations (
          id, checksum, migration_name, finished_at, applied_steps_count
        ) VALUES (?, ?, ?, ?, ?)
      `).run(id, checksum, migration.name, new Date().toISOString(), 1);

      const duration = Date.now() - startTime;
      console.log(`✅ ${migration.name} (${duration}ms)`);
    } catch (error) {
      console.error(`❌ Failed ${migration.name}:`, error);
      throw error;
    }
  }

  console.log("\n✅ All migrations applied successfully\n");
}

/**
 * Main application
 */
async function main() {
  console.log("🚀 Standalone binary with Prisma migrations\n");
  console.log(`📊 Stats:`);
  console.log(`   - Embedded migrations: ${EMBEDDED_MIGRATIONS.length}`);
  console.log(`   - Dependencies: 0 (zero!)`);
  console.log(`   - Runtime: Bun native SQLite\n`);

  // Database location
  const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "./app.db";

  // Create adapter
  const factory = new PrismaBunSqlite({ url: `file:${dbPath}` });
  const adapter = await factory.connect();

  // Apply embedded migrations
  await applyMigrations(adapter);

  // Create Prisma Client
  const prisma = new PrismaClient({ adapter });

  try {
    // Your application logic here
    console.log("🎉 Application ready!");
    console.log(`📦 Database: ${dbPath}`);

    // Example queries
    const userCount = await prisma.user.count();
    console.log(`👥 Users in database: ${userCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
