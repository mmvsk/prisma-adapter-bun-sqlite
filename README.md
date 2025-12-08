# prisma-adapter-bun-sqlite

Reliable, fast, zero-dependency Prisma adapter for Bun's native SQLite.

[![npm](https://img.shields.io/npm/v/prisma-adapter-bun-sqlite)](https://www.npmjs.com/package/prisma-adapter-bun-sqlite)
[![tests](https://img.shields.io/badge/tests-137%2F137-success)](./tests)
[![bun](https://img.shields.io/badge/bun-1.3.3+-black)](https://bun.sh)
[![prisma](https://img.shields.io/badge/prisma-7.0+-blue)](https://prisma.io)

## Why This Adapter?

- **Fully-tested** - 135 tests including 40 scenarios ported from Prisma's official test suite
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
| `timestampFormat` | `"iso8601"` \| `"unixepoch-ms"` | `"iso8601"` | DateTime storage format |
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
| Bun | >= 1.3.3 |
| Prisma | >= 7.0.0 |

### Runtime Support

| Runtime | Support |
|---------|---------|
| Bun | ✅ |
| Node.js | ❌ (use better-sqlite3 adapter) |
| Browser | ❌ |

## Limitations

- **Bun only** - Requires Bun's native `bun:sqlite`
- **SQLite only** - Not a PostgreSQL/MySQL adapter
- **Single writer** - SQLite limitation (readers unlimited)
- **Local only** - No network support (use libsql for Turso)
- **SERIALIZABLE only** - SQLite's only isolation level
- **Aggregate DateTime with `unixepoch-ms`** - When using `timestampFormat: "unixepoch-ms"` with `safeIntegers: true` (default), aggregate functions (`_min`, `_max`) on DateTime fields return `Invalid Date`. This occurs because SQLite returns integers for aggregates, which get converted to BigInt strings that JavaScript's `Date` constructor cannot parse. Set `safeIntegers: false` if you don't have BigInt columns.

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
