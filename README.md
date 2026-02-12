# prisma-adapter-bun-sqlite

Reliable, fast, zero-dependency Prisma adapter for Bun's native SQLite.

[![npm](https://img.shields.io/npm/v/prisma-adapter-bun-sqlite)](https://www.npmjs.com/package/prisma-adapter-bun-sqlite)
[![tests](https://img.shields.io/badge/tests-158%2F158-success)](./tests)
[![bun](https://img.shields.io/badge/bun-1.3.0+-black)](https://bun.sh)
[![prisma](https://img.shields.io/badge/prisma-7.0+-blue)](https://prisma.io)

## Why This Adapter?

- **Fully-tested** - 158 tests including 40 scenarios ported from Prisma's official test suite
- **Drop-in replacement** - Compatible with `@prisma/adapter-libsql` and `@prisma/adapter-better-sqlite3`
- **Production-ready** - WAL mode, safe integers, proper error mapping to Prisma codes (P2002, P2003, etc.)
- **Zero dependencies** - Uses Bun's native `bun:sqlite`, no Node.js packages or native binaries
- **Programmatic migrations** - Run migrations from TypeScript, perfect for `:memory:` testing
- **Single binary deployment** - Works with `bun build --compile`, embed migrations in your executable
- **Fast** - [faster than alternatives](https://github.com/mmvsk/prisma-adapter-bun-sqlite-benchmark) with 100% correctness

## Installation

```bash
bun add prisma-adapter-bun-sqlite
```

## Quick Start

**1. Configure Prisma schema:**

```prisma
// prisma/schema.prisma
generator client {
  provider   = "prisma-client"
  engineType = "client"
  runtime    = "bun"

  // Path of the generated code containing Prisma Client. Relative to the directory where sits schema.prisma
  output     = "./generated"
}

datasource db {
  provider = "sqlite"
  // Note: In Prisma 7+, the URL is passed via adapter in PrismaClient constructor
  // See: https://pris.ly/d/prisma7-client-config
}
```

**2. Use the adapter:**

```typescript
import { PrismaClient } from "./path/to/prisma/generated/client";
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

const adapter = new PrismaBunSqlite({ url: "file:./path/to/db.sqlite" });
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany();
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | required | Database path (`file:./path/to/db.sqlite`) or `:memory:` |
| `shadowDatabaseUrl` | `string` | `":memory:"` | Shadow DB for migrations |
| `safeIntegers` | `boolean` | `true` | Prevent precision loss for BigInt |
| `timestampFormat` | `"iso8601"` \| `"unixepoch-ms"` | `"iso8601"` | DateTime storage. `iso8601` is safe; `unixepoch-ms` requires workaround (see [Timestamp Format](#timestamp-format)) |
| `allowBigIntToNumberConversion` | `boolean` | `false` | With `unixepoch-ms`: converts BigInts in timestamp range to numbers (see [Timestamp Format](#timestamp-format)) |
| `allowUnsafeDateTimeAggregates` | `boolean` | `false` | With `unixepoch-ms`: accepts DateTime aggregate limitation (see [Timestamp Format](#timestamp-format)) |
| `wal` | `boolean` \| `WalConfiguration` | `undefined` | WAL mode configuration |

```typescript
// Production configuration with WAL
const adapter = new PrismaBunSqlite({
  url: "file:./path/to/db.sqlite",
  safeIntegers: true,
  timestampFormat: "iso8601",
  shadowDatabaseUrl: ":memory:",
  wal: {
    enabled: true,
    synchronous: "NORMAL",  // 2-3x faster than FULL
    busyTimeout: 10000,
  },
});
```

### Timestamp Format

The adapter supports two DateTime storage formats:

| Format | Storage | Pros | Cons |
|--------|---------|------|------|
| `iso8601` (default) | `TEXT` | Safe, human-readable, SQLite date functions work | Slightly larger storage |
| `unixepoch-ms` | `INTEGER` | Compact, fast comparisons | Requires workaround (see below) |

**Recommendation:** Use `iso8601` (default). It's safe and works correctly in all cases.

#### Why `unixepoch-ms` needs a workaround

When using `timestampFormat: "unixepoch-ms"` with `safeIntegers: true` (the default), DateTime aggregate functions (`_min`, `_max`) return `Invalid Date`.

**Why this happens:** Unix timestamps in milliseconds (e.g., `1733644800000`) exceed JavaScript's safe integer range when stored as SQLite INTEGER. With `safeIntegers: true`, SQLite returns these as BigInt, but Prisma expects numbers for DateTime aggregates.

This is a known limitation that also affects the official `@prisma/adapter-better-sqlite3`.

#### Choosing `unixepoch-ms`

If you want `unixepoch-ms` (e.g., for performance or existing schema), you must choose one of three workarounds:

**Option 1: `safeIntegers: false`** (simplest, if your data allows)

```typescript
const adapter = new PrismaBunSqlite({
  url: "file:./db.sqlite",
  timestampFormat: "unixepoch-ms",
  safeIntegers: false,  // All integers returned as JS numbers
});
```

- All integers are JavaScript numbers (no BigInt)
- **Compromise:** Integers outside `Number.MAX_SAFE_INTEGER` (±9007199254740991) lose precision
- **Safe when:** Your BIGINT columns stay within safe integer range

**Option 2: `allowBigIntToNumberConversion: true`** (fixes aggregates, mixed return types)

```typescript
const adapter = new PrismaBunSqlite({
  url: "file:./db.sqlite",
  timestampFormat: "unixepoch-ms",
  allowBigIntToNumberConversion: true,
});
```

- BigInts in timestamp range (0 to ~year 2200) are converted to numbers
- Other BigInts remain as strings (Prisma's standard BigInt format)
- **Compromise:** Integer return types are mixed (some `number`, some `string`)
- **Safe when:** You're aware of the mixed types and handle them accordingly

**Option 3: `allowUnsafeDateTimeAggregates: true`** (accepts limitation)

```typescript
const adapter = new PrismaBunSqlite({
  url: "file:./db.sqlite",
  timestampFormat: "unixepoch-ms",
  allowUnsafeDateTimeAggregates: true,
});
```

- All BigInts consistently returned as strings
- DateTime aggregates (`_min`, `_max`) return `Invalid Date`
- **This is what `@prisma/adapter-better-sqlite3` does**
- **Safe when:** You don't use `_min`/`_max` on DateTime fields, or handle `Invalid Date`

Using `unixepoch-ms` without one of these options throws an error at adapter creation.

## Features

### Prisma Support

Full support for all Prisma operations:

- CRUD operations (create, read, update, delete, upsert)
- Relations (one-to-one, one-to-many, many-to-many, cascades)
- Filtering, ordering, pagination, distinct
- Aggregations (count, sum, avg, min, max, groupBy)
- Transactions (interactive and sequential)
- Raw queries (`$queryRaw`, `$executeRaw`)
- Migrations (`prisma migrate dev/deploy`)

### Type Conversions

| Prisma | SQLite | Notes |
|--------|--------|-------|
| `String` | `TEXT` | |
| `Int` | `INTEGER` | 32-bit |
| `BigInt` | `TEXT` | Safe integer handling |
| `Float` | `REAL` | |
| `Decimal` | `TEXT` | No native decimal in SQLite |
| `Boolean` | `INTEGER` | 0/1 |
| `DateTime` | `TEXT`/`INTEGER` | ISO8601 or Unix ms |
| `Bytes` | `BLOB` | |
| `Json` | `TEXT` | |

### Error Mapping

| SQLite Error | Prisma Code | Description |
|--------------|-------------|-------------|
| `SQLITE_CONSTRAINT_UNIQUE` | P2002 | Unique violation |
| `SQLITE_CONSTRAINT_FOREIGNKEY` | P2003 | Foreign key violation |
| `SQLITE_CONSTRAINT_NOTNULL` | P2011 | Null violation |
| `SQLITE_BUSY` | Timeout | Database locked |

## Migrations

### CLI Migrations

Standard Prisma CLI works normally:

```bash
bunx --bun prisma migrate dev
bunx --bun prisma migrate deploy
```

### Programmatic Migrations

Run migrations from TypeScript - perfect for testing and standalone binaries:

```typescript
import {
  PrismaBunSqlite,
  runMigrations,
  loadMigrationsFromDir,
  createTestDatabase
} from "prisma-adapter-bun-sqlite";

// Option 1: Load from filesystem
const migrations = await loadMigrationsFromDir("./prisma/migrations");
const factory = new PrismaBunSqlite({ url: "file:./path/to/db.sqlite" });
const adapter = await factory.connect();
await runMigrations(adapter, migrations);

// Option 2: In-memory database for tests (fast!)
const adapter = await createTestDatabase([
  { name: "001_init", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);" }
]);
const prisma = new PrismaClient({ adapter });
```

### Standalone Binary

Embed migrations in a single executable:

```typescript
// build.ts - compile with: bun build --compile ./build.ts
import { PrismaBunSqlite, runMigrations } from "prisma-adapter-bun-sqlite";
import { PrismaClient } from "@prisma/client";

// Migrations embedded at build time
const migrations = [
  { name: "001_init", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY);" }
];

const factory = new PrismaBunSqlite({ url: "file:./path/to/db.sqlite" });
const adapter = await factory.connect();
await runMigrations(adapter, migrations, { logger: () => {} });

const prisma = new PrismaClient({ adapter });
// Your app logic...
```

## Requirements

| Requirement | Version |
|-------------|---------|
| Bun | >= 1.3.0 |
| Prisma | >= 7.0.0 |

### Runtime Support

| Runtime | Support |
|---------|---------|
| Bun | ✅ |
| Node.js | ❌ (use better-sqlite3 adapter) |
| Browser | ❌ |

## Sanity Checks

Optional runtime validation to verify your SQLite database is configured correctly:

```typescript
import { checkWalMode, checkForeignKeys } from "prisma-adapter-bun-sqlite";
// Or: import { checkWalMode, checkForeignKeys } from "prisma-adapter-bun-sqlite/sanity-check";

// At application startup
await checkForeignKeys(prisma);  // Throws if foreign_keys != 1
await checkWalMode(prisma);      // Throws if journal_mode != "wal"
```

### `checkForeignKeys(prisma)`

Validates that foreign key constraints are enabled. SQLite disables these by default, which can lead to orphaned records and data integrity issues.

**Note:** If using `PrismaBunSqlite`, foreign keys are enabled by default.

### `checkWalMode(prisma)`

Validates that WAL (Write-Ahead Logging) mode is enabled. WAL mode provides better concurrency and performance for most workloads.

Both functions throw descriptive errors with the actual vs expected values and remediation instructions:

```
Error: SQLite foreign key constraints are not enabled.
Expected foreign_keys = 1, got 0.
Enable foreign keys by running: PRAGMA foreign_keys = ON;
```

## Limitations

- **Bun only** - Requires Bun's native `bun:sqlite`
- **SQLite only** - Not a PostgreSQL/MySQL adapter
- **Single writer** - SQLite limitation (readers unlimited)
- **Local only** - No network support (use libsql for Turso)
- **SERIALIZABLE only** - SQLite's only isolation level

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for implementation details, design decisions, and comparison with official Prisma adapters.

## Contributing

```bash
git clone https://github.com/mmvsk/prisma-adapter-bun-sqlite.git
cd prisma-adapter-bun-sqlite
bun install
bun test
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) before contributing.

## License

MIT

## Links

- [npm](https://www.npmjs.com/package/prisma-adapter-bun-sqlite)
- [GitHub](https://github.com/mmvsk/prisma-adapter-bun-sqlite)
- [Changelog](./CHANGELOG.md)
- [Benchmarks](https://github.com/mmvsk/benchmark-prisma-sqlite-adapter)
