# Prisma Adapter for Bun SQLite

A native Prisma driver adapter for [Bun's built-in SQLite](https://bun.sh/docs/api/sqlite) (`bun:sqlite`). Zero Node.js dependencies, optimized for Bun runtime.

[![npm version](https://img.shields.io/npm/v/prisma-adapter-bun-sqlite)](https://www.npmjs.com/package/prisma-adapter-bun-sqlite)
[![Tests](https://img.shields.io/badge/tests-77%2F77%20passing-success)](./tests)
[![Bun](https://img.shields.io/badge/bun-v1.3.2+-black)](https://bun.sh)
[![Prisma](https://img.shields.io/badge/prisma-7.0.0+-blue)](https://prisma.io)

## ✨ What's New in v0.3.0

- **🎯 Prisma 7 Support** - Full compatibility with Prisma ORM 7.0.0+ (Rust-free client)
- **📦 Naming Convention** - Updated to `PrismaBunSqlite` (follows Prisma 7 standardized naming)
- **⚡ Smaller Bundles** - ~90% smaller with Prisma 7's Rust-free architecture
- **🔄 Shadow Database Support** - Full `prisma migrate dev` compatibility (v0.2.0+)
- **💾 Programmatic Migrations** - Run migrations from TypeScript for :memory: testing (v0.2.0+)

[See full changelog →](./CHANGELOG.md)

## Why This Adapter?

- **⚡ Fastest for Bun + SQLite**: 2.1x faster than alternatives with 100% test compatibility ([see benchmarks](https://github.com/mmvsk/prisma-adapter-bun-sqlite-benchmark))
- **🚀 Zero Dependencies**: Uses Bun's native `bun:sqlite` - no Node.js packages or native binaries required
- **📦 Pure JavaScript Migrations**: Run migrations programmatically without shipping migration files or CLI tools (v0.2.0+)
- **🎯 Single Binary Deployment**: Perfect for `bun build --compile` - embed everything in one executable
- **✅ Production Ready**: Passes 77/77 comprehensive tests covering all Prisma operations
- **🔄 Full Migration Support**: Shadow database + programmatic migrations for seamless development and deployment
- **📝 Fully Compatible**: Drop-in replacement for `@prisma/adapter-libsql` or `@prisma/adapter-better-sqlite3`

## Installation

```bash
bun add prisma-adapter-bun-sqlite
```

### Install from Source (for development)

```bash
git clone https://github.com/mmvsk/prisma-adapter-bun-sqlite.git
cd prisma-adapter-bun-sqlite
bun install
```

## Quick Start

### 1. Setup Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider   = "prisma-client"  // Updated for Prisma 7
  engineType = "client"
  runtime    = "bun"
  output     = "./generated"
}

datasource db {
  provider = "sqlite"
  // Note: In Prisma 7+, URL is passed via adapter in code, not here
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
}
```

### 2. Generate Prisma Client

```bash
bunx prisma generate
```

### 3. Use the Adapter

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

// Create adapter instance
const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });

// Initialize Prisma Client
const prisma = new PrismaClient({ adapter });

// Use Prisma normally
const user = await prisma.user.create({
  data: {
    email: "alice@example.com",
    name: "Alice",
  },
});

console.log(user);
```

## 🔄 Migrations in Prisma 7

**Important:** Prisma 7 separates CLI operations from runtime operations. Here's how it works:

### CLI Migrations (Rust Engine)

When you run migration commands, Prisma uses the **traditional Rust query engine** (not your adapter):

```bash
# These commands use prisma.config.ts datasource URL
bunx prisma migrate dev      # ✅ Uses Rust engine
bunx prisma db push          # ✅ Uses Rust engine
bunx prisma db pull          # ✅ Uses Rust engine
bunx prisma migrate deploy   # ✅ Uses Rust engine
```

**Configuration in `prisma.config.ts`:**

```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:./prisma/dev.db"
    }
  }
});
```

### Runtime Queries (Your Adapter)

Your application code uses the **adapter** for all database operations:

```typescript
// Your application - uses adapter
const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

await prisma.user.findMany(); // ✅ Uses your Bun adapter
```

### Why This Architecture?

| Aspect | CLI (Rust Engine) | Runtime (Adapter) |
|--------|------------------|------------------|
| **Commands** | `migrate dev`, `db push` | Your app queries |
| **Engine** | Traditional Rust | Rust-free JS compiler |
| **Speed** | Standard | 3x faster |
| **Bundle Size** | N/A (CLI only) | 90% smaller |
| **Compatibility** | Works with Node | Optimized for Bun |

### Standalone Deployments (No node_modules)

For standalone binaries, use **programmatic migrations** (v0.2.0+):

```typescript
import { createTestDatabase, loadMigrationsFromDir } from "prisma-adapter-bun-sqlite";

// Load migrations at build time
const migrations = await loadMigrationsFromDir("./prisma/migrations");

// Apply to :memory: database (perfect for testing!)
const adapter = await createTestDatabase(migrations);

// Or apply to file database
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
const adapter = new PrismaBunSqlite({ url: "file:./app.db" });
await runMigrations(adapter, migrations);
```

**See [examples/](./examples/) for complete standalone binary examples.**

---

## API Reference

### `PrismaBunSqlite`

Factory class for creating adapter instances.

```typescript
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

const adapter = new PrismaBunSqlite(config);
```

**Configuration:**

```typescript
type PrismaBunSqliteConfig = {
  url: string;                                    // Required: Database URL
  shadowDatabaseUrl?: string;                     // Optional: Shadow DB for migrations (default: ":memory:")
  timestampFormat?: "iso8601" | "unixepoch-ms";  // Optional: Default "iso8601"
  safeIntegers?: boolean;                         // Optional: Default true
                                                   // Enable safe 64-bit integer handling
                                                   // Prevents precision loss for BIGINT values
};
```

**Examples:**

```typescript
// File-based database
const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });

// In-memory database
const adapter = new PrismaBunSqlite({ url: ":memory:" });

// With shadow database for migrations (v0.2.0+)
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  shadowDatabaseUrl: ":memory:"  // Fast shadow DB for migration testing
});

// With custom timestamp format
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  timestampFormat: "unixepoch-ms"
});

// With safe integers disabled (advanced use only)
// Note: Disabling may cause precision loss for values > Number.MAX_SAFE_INTEGER
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  safeIntegers: false
});
```

### `BunSqliteAdapter`

Low-level adapter class (advanced usage).

```typescript
import { Database } from "bun:sqlite";
import { BunSqliteAdapter } from "prisma-adapter-bun-sqlite";

const db = new Database("./dev.db");
const adapter = new BunSqliteAdapter(db, options);
```

### Migration Utilities (v0.2.0+)

Programmatic migration control for TypeScript-based workflows.

```typescript
import {
  runMigrations,
  createTestDatabase,
  loadMigrationsFromDir,
  getAppliedMigrations,
  getPendingMigrations,
} from "prisma-adapter-bun-sqlite";
```

**Quick Examples:**

```typescript
// Create :memory: database with migrations (perfect for tests!)
const adapter = await createTestDatabase([
  { name: "001_init", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY);" }
]);
const prisma = new PrismaClient({ adapter });

// Load and run migrations from filesystem
const migrations = await loadMigrationsFromDir("./prisma/migrations");
await runMigrations(adapter, migrations);

// Check migration status
const applied = await getAppliedMigrations(adapter);
const pending = await getPendingMigrations(adapter, allMigrations);
```

**See [examples/](./examples/) for:**
- Standalone binaries with embedded migrations
- :memory: database testing patterns
- Custom migration workflows

## Features

### ✅ Comprehensive Prisma Support

- **CRUD Operations**: Create, read, update, delete, upsert
- **Relations**: One-to-one, one-to-many, many-to-many with cascade deletes
- **Filtering & Querying**: Where clauses, orderBy, pagination, distinct
- **Aggregations**: Count, sum, avg, min, max, groupBy
- **Transactions**: Interactive and sequential transactions with rollback
- **Raw Queries**: `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`
- **Migrations**: Full schema migration support via `prisma migrate`

### 🎯 Type Coercion

Automatic conversion between Prisma and SQLite types:

| Prisma Type | SQLite Type | Notes |
|-------------|-------------|-------|
| `String` | `TEXT` | UTF-8 encoded |
| `Int` | `INTEGER` | 32-bit integers |
| `BigInt` | `TEXT` | Stored as string (SQLite 64-bit limit) |
| `Float` | `REAL` | Double precision |
| `Decimal` | `TEXT` | Stored as string (no native decimal) |
| `Boolean` | `INTEGER` | `0` = false, `1` = true |
| `DateTime` | `TEXT` or `INTEGER` | ISO8601 string or Unix timestamp (ms) |
| `Bytes` | `BLOB` | Binary data |
| `Json` | `TEXT` | JSON string |

### 🛡️ Error Handling

SQLite errors are automatically mapped to Prisma error codes:

| SQLite Error | Prisma Error | Description |
|--------------|--------------|-------------|
| `SQLITE_CONSTRAINT_UNIQUE` | `P2002` | Unique constraint violation |
| `SQLITE_CONSTRAINT_FOREIGNKEY` | `P2003` | Foreign key constraint violation |
| `SQLITE_CONSTRAINT_NOTNULL` | `P2011` | Null constraint violation |
| `SQLITE_BUSY` | Timeout | Database locked |

### ⚙️ Configuration

The adapter automatically configures optimal SQLite settings:

```typescript
// Applied on connection
PRAGMA foreign_keys = ON        // Enable foreign key constraints
PRAGMA busy_timeout = 5000      // 5 second lock timeout
PRAGMA journal_mode = WAL       // Write-Ahead Logging for performance
```

## Usage Examples

### Basic CRUD

```typescript
// Create
const user = await prisma.user.create({
  data: { email: "bob@example.com", name: "Bob" },
});

// Read
const users = await prisma.user.findMany({
  where: { name: { contains: "Alice" } },
  orderBy: { email: "asc" },
});

// Update
await prisma.user.update({
  where: { id: 1 },
  data: { name: "Alice Smith" },
});

// Delete
await prisma.user.delete({ where: { id: 1 } });
```

### Transactions

```typescript
// Interactive transaction
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email: "charlie@example.com" },
  });

  await tx.post.create({
    data: {
      title: "My First Post",
      authorId: user.id,
    },
  });
});

// Sequential transaction
await prisma.$transaction([
  prisma.user.create({ data: { email: "dave@example.com" } }),
  prisma.user.create({ data: { email: "eve@example.com" } }),
]);
```

### Raw Queries

```typescript
// Raw SELECT
const users = await prisma.$queryRaw<User[]>`
  SELECT * FROM User WHERE email LIKE ${"%.com"}
`;

// Raw INSERT/UPDATE/DELETE
const count = await prisma.$executeRaw`
  UPDATE User SET name = ${"Anonymous"} WHERE name IS NULL
`;
```

### Custom Timestamp Format

```typescript
// Use Unix timestamps instead of ISO8601
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  timestampFormat: "unixepoch-ms",
});

const prisma = new PrismaClient({ adapter });
```

## Migration from Other Adapters

### From `@prisma/adapter-libsql`

```diff
- import { PrismaLibSQL } from "@prisma/adapter-libsql";
+ import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

- const adapter = new PrismaLibSQL({ url: "file:./dev.db" });
+ const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });

const prisma = new PrismaClient({ adapter });
```

### From `@prisma/adapter-better-sqlite3`

```diff
- import Database from "better-sqlite3";
- import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
+ import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

- const db = new Database("./dev.db");
- const adapter = new PrismaBetterSqlite3(db);
+ const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });

const prisma = new PrismaClient({ adapter });
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests (77 tests: 57 general + 11 migrations + 9 shadow DB)
bun test

# Run specific test suites
bun test tests/general.test.ts           # Core adapter tests
bun test tests/migrations.test.ts        # Migration utility tests
bun test tests/shadow-database.test.ts   # Shadow DB tests

# Run with verbose output
bun test --verbose
```

Test coverage includes:
- 57 **Core Adapter Tests** (CRUD, relations, transactions, types, errors)
- 11 **Migration Utility Tests** (v0.2.0+)
- 9 **Shadow Database Tests** (v0.2.0+)
- 6 relation tests (including cascade deletes)
- 9 filtering & querying tests
- 3 aggregation tests
- 3 transaction tests (commit, rollback, sequential)
- 4 raw query tests
- 7 type coercion tests
- 4 error handling tests
- 6 edge case tests

## Performance

The adapter is **the fastest Prisma SQLite adapter for Bun**, outperforming all alternatives:

### Benchmark Results

Comprehensive benchmarks comparing all available Prisma SQLite adapters for Bun:

**[📊 Full Benchmark Results](https://github.com/mmvsk/prisma-adapter-bun-sqlite-benchmark)**

| Adapter | Performance | Correctness | Status |
|---------|-------------|-------------|--------|
| **prisma-adapter-bun-sqlite** | **242 ops/sec** 🏆 | ✅ 26/26 (100%) | **Recommended** |
| @prisma/adapter-libsql | 115 ops/sec (2.1x slower) | ✅ 26/26 (100%) | OK for Turso |
| @abcx3/prisma-bun-adapter | 111 ops/sec (2.2x slower) | ❌ 7/26 (27%) | **Not Recommended** |

**Key advantages:**
- **2.1x faster** than @prisma/adapter-libsql on real disk workloads
- **100% test compatibility** - all Prisma features work correctly
- **Foreign keys enforced** - data integrity guaranteed
- **Proper error handling** - Prisma error codes (P2002, P2003, etc.)

### Technical Optimizations

- **Native Bun API**: Direct calls to `bun:sqlite` (zero overhead)
- **WAL Mode**: Write-Ahead Logging for better concurrency and performance
- **Prepared Statements**: All queries use prepared statements for security and speed
- **Safe Integers**: BigInt handling prevents precision loss
- **Zero Dependencies**: No runtime overhead from external packages

The benchmark suite includes 26 comprehensive tests covering CRUD, relations, transactions, aggregations, and more. See the [benchmark repository](https://github.com/mmvsk/prisma-adapter-bun-sqlite-benchmark) for detailed results and methodology.

## Deployment

### Bun Binary

```bash
# Build standalone executable
bun build ./src/index.ts --compile --outfile myapp

# Deploy single binary (no node_modules needed!)
./myapp
```

### Docker

```dockerfile
FROM oven/bun:1.3.2

WORKDIR /app
COPY . .
RUN bun install
RUN bunx prisma generate

CMD ["bun", "run", "src/index.ts"]
```

## Limitations

- **SQLite Specific**: Only works with SQLite databases
- **Single Writer**: SQLite limitation - one writer at a time (readers unlimited)
- **No Network**: Pure local file-based database (use libsql for networked SQLite)
- **Decimal Precision**: Decimals stored as TEXT (SQLite has no native decimal type)

## Architecture

For detailed implementation information, design decisions, and comparisons with the official Prisma adapters, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Contributing

Contributions welcome! Please read [ARCHITECTURE.md](./ARCHITECTURE.md) first to understand the implementation.

```bash
# Setup
git clone https://github.com/mmvsk/prisma-adapter-bun-sqlite.git
cd prisma-adapter-bun-sqlite
bun install

# Run tests
bun test

# Generate Prisma Client
bunx prisma generate
```

## License

MIT

## Credits

- Built with [Bun](https://bun.sh)
- Follows patterns from [Prisma's official adapters](https://github.com/prisma/prisma/tree/main/packages/adapter-better-sqlite3)
- Inspired by `@prisma/adapter-better-sqlite3` and `@prisma/adapter-libsql`

## Related Projects

- [@prisma/adapter-better-sqlite3](https://github.com/prisma/prisma/tree/main/packages/adapter-better-sqlite3) - Official adapter for better-sqlite3 (Node.js)
- [@prisma/adapter-libsql](https://github.com/prisma/prisma/tree/main/packages/adapter-libsql) - Official adapter for libsql/turso
- [bun:sqlite](https://bun.sh/docs/api/sqlite) - Bun's native SQLite API

## Support

- [GitHub Issues](https://github.com/mmvsk/prisma-adapter-bun-sqlite/issues)
- [Prisma Discord](https://discord.gg/prisma)
- [Bun Discord](https://bun.sh/discord)
