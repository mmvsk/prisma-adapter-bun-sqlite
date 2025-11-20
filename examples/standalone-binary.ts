/**
 * Example: Standalone Bun binary with embedded Prisma migrations
 *
 * Build: bun build --compile ./examples/standalone-binary.ts --outfile myapp
 * Run: ./myapp
 *
 * Result: Single binary with NO node_modules required!
 */

import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
import { PrismaClient } from "@prisma/client";

// Embed migrations as strings (can also use Bun.file() for external files)
const migrations = [
  {
    name: "001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS User (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS Post (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT 0,
        authorId INTEGER NOT NULL,
        FOREIGN KEY (authorId) REFERENCES User(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_post_author ON Post(authorId);
    `,
  },
  {
    name: "002_add_profile",
    sql: `
      CREATE TABLE IF NOT EXISTS Profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio TEXT,
        userId INTEGER NOT NULL UNIQUE,
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
      );
    `,
  },
];

// Track applied migrations in the database
const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

async function runMigrations(adapter: any) {
  console.log("🔄 Running migrations...");

  // Create migration tracking table
  await adapter.executeScript(MIGRATION_TABLE_SQL);

  // Get database connection to check applied migrations
  const db = (adapter as any).db; // Access underlying Bun SQLite database

  for (const migration of migrations) {
    // Check if migration already applied
    const applied = db
      .prepare("SELECT id FROM _prisma_migrations WHERE name = ?")
      .get(migration.name);

    if (applied) {
      console.log(`⏭️  Skipping ${migration.name} (already applied)`);
      continue;
    }

    console.log(`▶️  Applying ${migration.name}...`);

    try {
      // Run migration
      await adapter.executeScript(migration.sql);

      // Record migration
      db.prepare(
        "INSERT INTO _prisma_migrations (id, name) VALUES (?, ?)"
      ).run(crypto.randomUUID(), migration.name);

      console.log(`✅ Applied ${migration.name}`);
    } catch (error) {
      console.error(`❌ Failed to apply ${migration.name}:`, error);
      throw error;
    }
  }

  console.log("✅ All migrations applied\n");
}

async function main() {
  console.log("🚀 Starting standalone binary with embedded migrations\n");

  // Database will be created in the same directory as the binary
  const dbPath = new URL("./app.db", import.meta.url).pathname;

  // Create adapter
  const factory = new PrismaBunSqlite({ url: `file:${dbPath}` });
  const adapter = await factory.connect();

  // Run embedded migrations
  await runMigrations(adapter);

  // Create Prisma Client
  const prisma = new PrismaClient({ adapter });

  try {
    // Example: Create a user
    const user = await prisma.user.create({
      data: {
        email: "alice@example.com",
        name: "Alice",
        posts: {
          create: [
            { title: "Hello World", content: "My first post!" },
            { title: "Bun is awesome", content: "Zero dependencies!" },
          ],
        },
      },
      include: {
        posts: true,
      },
    });

    console.log("📝 Created user:");
    console.log(JSON.stringify(user, null, 2));

    // Example: Query all users
    const users = await prisma.user.findMany({
      include: {
        posts: true,
        profile: true,
      },
    });

    console.log("\n👥 All users:");
    console.log(JSON.stringify(users, null, 2));
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n✅ Done! This was a standalone binary with NO node_modules!");
  console.log(`📦 Database file: ${dbPath}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
