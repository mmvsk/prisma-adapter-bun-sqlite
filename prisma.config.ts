/**
 * Prisma Configuration with Bun SQLite Adapter (v0.2.0+)
 *
 * This config enables:
 * - JS engine with driver adapters
 * - Shadow database support for migrations
 * - Full `prisma migrate dev` compatibility
 */

import { defineConfig, env } from "prisma/config";
import { PrismaBunSQLite } from "./src/bunsqlite-adapter";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },

  // Use JS engine with driver adapters (v0.2.0+)
  engine: "js",
  experimental: {
    adapter: true,
  },

  // Adapter configuration
  adapter: async () => {
    return new PrismaBunSQLite({
      url: env("DATABASE_URL_FROM_PRISMA"),
      // Shadow database for migrations (defaults to :memory: for speed)
      shadowDatabaseUrl: ":memory:",
    });
  },
});
