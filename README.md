# Prisma Adapter for Bun SQLite

A native Prisma driver adapter for [Bun's built-in SQLite](https://bun.sh/docs/api/sqlite) (`bun:sqlite`). Zero Node.js dependencies, optimized for Bun runtime.

[![Tests](https://img.shields.io/badge/tests-51%2F51%20passing-success)](./tests)
[![Bun](https://img.shields.io/badge/bun-v1.3.2+-black)](https://bun.sh)
[![Prisma](https://img.shields.io/badge/prisma-6.19.0+-blue)](https://prisma.io)

## Why This Adapter?

- **🚀 Zero Dependencies**: Uses Bun's native `bun:sqlite` - no Node.js packages required
- **⚡ Performance**: Native Bun API is faster than Node.js alternatives
- **🎯 Simple Deployment**: Single binary deployment with Bun - no node_modules needed
- **✅ Production Ready**: Passes 51/51 comprehensive tests covering all Prisma operations
- **📦 Fully Compatible**: Drop-in replacement for `@prisma/adapter-libsql` or `@prisma/adapter-better-sqlite3`

## Installation

```bash
bun add prisma-adapter-bunsqlite
# Note: Package not yet published - install from source for now
```

Or install from source:

```bash
git clone https://github.com/mmvsk/prisma-adapter-bunsqlite.git
cd prisma-adapter-bunsqlite
bun install
```

## Quick Start

### 1. Setup Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  engineType      = "client"
  runtime         = "bun"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
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
import { PrismaBunSQLite } from "prisma-adapter-bunsqlite";

// Create adapter instance
const adapter = new PrismaBunSQLite({ url: "file:./dev.db" });

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

## API Reference

### `PrismaBunSQLite`

Factory class for creating adapter instances.

```typescript
import { PrismaBunSQLite } from "prisma-adapter-bunsqlite";

const adapter = new PrismaBunSQLite(config);
```

**Configuration:**

```typescript
type PrismaBunSQLiteConfig = {
  url: string;                                    // Required: Database URL
  timestampFormat?: "iso8601" | "unixepoch-ms";  // Optional: Default "iso8601"
  safeIntegers?: boolean;                         // Optional: Default true
                                                   // Enable safe 64-bit integer handling
                                                   // Prevents precision loss for BIGINT values
};
```

**Examples:**

```typescript
// File-based database
const adapter = new PrismaBunSQLite({ url: "file:./dev.db" });

// In-memory database
const adapter = new PrismaBunSQLite({ url: ":memory:" });

// With custom timestamp format
const adapter = new PrismaBunSQLite({
  url: "file:./dev.db",
  timestampFormat: "unixepoch-ms"
});

// With safe integers disabled (advanced use only)
// Note: Disabling may cause precision loss for values > Number.MAX_SAFE_INTEGER
const adapter = new PrismaBunSQLite({
  url: "file:./dev.db",
  safeIntegers: false
});
```

### `BunSQLiteAdapter`

Low-level adapter class (advanced usage).

```typescript
import { Database } from "bun:sqlite";
import { BunSQLiteAdapter } from "prisma-adapter-bunsqlite";

const db = new Database("./dev.db");
const adapter = new BunSQLiteAdapter(db, options);
```

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
const adapter = new PrismaBunSQLite("./dev.db", {
  timestampFormat: "unixepoch-ms",
});

const prisma = new PrismaClient({ adapter });
```

## Migration from Other Adapters

### From `@prisma/adapter-libsql`

```diff
- import { PrismaLibSQL } from "@prisma/adapter-libsql";
+ import { PrismaBunSQLite } from "prisma-adapter-bunsqlite";

- const adapter = new PrismaLibSQL({ url: "file:./dev.db" });
+ const adapter = new PrismaBunSQLite({ url: "file:./dev.db" });

const prisma = new PrismaClient({ adapter });
```

### From `@prisma/adapter-better-sqlite3`

```diff
- import Database from "better-sqlite3";
- import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
+ import { PrismaBunSQLite } from "prisma-adapter-bunsqlite";

- const db = new Database("./dev.db");
- const adapter = new PrismaBetterSqlite3(db);
+ const adapter = new PrismaBunSQLite({ url: "file:./dev.db" });

const prisma = new PrismaClient({ adapter });
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests (51 tests)
bun test

# Run specific adapter tests
bun test tests/bunsqlite-adapter.test.ts

# Run with verbose output
bun test --verbose
```

Test coverage includes:
- 12 CRUD operation tests
- 6 relation tests (including cascade deletes)
- 9 filtering & querying tests
- 3 aggregation tests
- 3 transaction tests (commit, rollback, sequential)
- 4 raw query tests
- 7 type coercion tests
- 4 error handling tests
- 6 edge case tests

## Performance

The adapter is optimized for performance:

- **Native Bun API**: Direct calls to `bun:sqlite` (no overhead)
- **WAL Mode**: Write-Ahead Logging enabled by default
- **Prepared Statements**: All queries use prepared statements
- **Zero Dependencies**: No additional runtime overhead

Benchmarks show comparable or better performance vs Node.js alternatives.

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
git clone https://github.com/mmvsk/prisma-adapter-bunsqlite.git
cd prisma-adapter-bunsqlite
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

- [GitHub Issues](https://github.com/mmvsk/prisma-adapter-bunsqlite/issues)
- [Prisma Discord](https://discord.gg/prisma)
- [Bun Discord](https://bun.sh/discord)
