/**
 * Prisma Configuration (Prisma 7+)
 *
 * In Prisma 7, the config file is for CLI tools (migrate, db pull).
 * The adapter is passed directly to PrismaClient constructor in code.
 *
 * For migrations with driver adapters, run:
 *   DATABASE_URL="file:./prisma/dev.db" bunx prisma migrate dev
 *
 * Or set up adapter in a Node.js-compatible way for migrations.
 */

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
