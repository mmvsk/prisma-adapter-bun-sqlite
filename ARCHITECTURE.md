# Architecture

Implementation details and design decisions for `prisma-adapter-bun-sqlite`.

## Overview

This adapter implements Prisma's `SqlDriverAdapter` interface for Bun's native `bun:sqlite` API.

**Goals:**
1. Zero dependencies - only Bun's native APIs
3. Production-ready - proper error handling, type conversions, defensive defaults
2. Battle-tested - 136 tests including official Prisma scenarios
4. Fast - leverage Bun's native performance

## File Structure

```
src/
├── index.ts          # Public exports
├── types.ts          # Type definitions (WalConfiguration, PrismaBunSqliteConfig, etc.)
├── errors.ts         # Error mapping (SQLite → Prisma error codes)
├── conversion.ts     # Type conversions (mapArg, mapRow, getColumnTypes)
├── queryable.ts      # BunSqliteQueryable base class (queryRaw, executeRaw)
├── transaction.ts    # BunSqliteTransaction + AsyncMutex
├── adapter.ts        # BunSqliteAdapter (main adapter class)
├── factory.ts        # PrismaBunSqlite factory class
└── migration.ts      # Programmatic migration utilities
```

## Class Hierarchy

```
BunSqliteQueryable (base class)
├── BunSqliteAdapter (main adapter)
└── BunSqliteTransaction (transaction handler)

PrismaBunSqlite (factory) → creates BunSqliteAdapter
```

## Key Implementation Details

### Type Conversion

**`conversion.ts`** handles all Prisma ↔ SQLite type mappings.

**Argument mapping (`mapArg`):**
| Prisma Input | SQLite Output |
|--------------|---------------|
| `boolean` | `1` or `0` |
| `"123"` (int type) | `123` (number) |
| `Date` | ISO8601 string or Unix ms |
| `base64 string` (bytes) | `Buffer` |
| `BigInt string` | `BigInt` |

**Row mapping (`mapRow`):**
| SQLite Value | Prisma Output |
|--------------|---------------|
| `ArrayBuffer`/`Buffer` | `number[]` |
| `bigint` | `string` |
| Unix timestamp (DateTime col) | ISO8601 string |
| Float in Int column | `Math.trunc()` |

### Error Handling

**`errors.ts`** maps SQLite errors to Prisma error kinds.

| SQLite Code | Prisma Kind | Prisma Code |
|-------------|-------------|-------------|
| `SQLITE_CONSTRAINT_UNIQUE` | `UniqueConstraintViolation` | P2002 |
| `SQLITE_CONSTRAINT_PRIMARYKEY` | `UniqueConstraintViolation` | P2002 |
| `SQLITE_CONSTRAINT_FOREIGNKEY` | `ForeignKeyConstraintViolation` | P2003 |
| `SQLITE_CONSTRAINT_NOTNULL` | `NullConstraintViolation` | P2011 |
| `SQLITE_BUSY` | `SocketTimeout` | - |

Bun sometimes returns only `.errno` (number) without `.code` (string), so we maintain a complete errno→code mapping.

### Transaction Management

**`transaction.ts`** implements transactions with `usePhantomQuery: false`.

**What `usePhantomQuery: false` means:**
- Prisma engine sends `COMMIT`/`ROLLBACK` SQL via `executeRaw()`
- Adapter's `commit()`/`rollback()` just release the mutex lock
- This matches the official `@prisma/adapter-better-sqlite3` pattern

**AsyncMutex:**
SQLite only allows one writer at a time. Our custom 35-line mutex serializes transactions without external dependencies.

```typescript
async startTransaction(): Promise<Transaction> {
  const releaseLock = await this.transactionMutex.acquire();
  this.db.run("BEGIN");
  return new BunSqliteTransaction(db, options, releaseLock);
}
```

### Column Type Detection

We use Bun's Statement metadata APIs (available since Bun 1.2.17):

| API | Availability | Returns | Use Case |
|-----|--------------|---------|----------|
| `stmt.columnNames` | Pre-execution (< 1.3.0)<br>Post-execution (1.3.3+) | `string[]` | Column names for result mapping |
| `stmt.declaredTypes` | Pre-execution (< 1.3.0)<br>Post-execution (1.3.3+) | `(string \| null)[]` | Schema types (e.g., "INTEGER", "TEXT") |
| `stmt.columnTypes` | Post-execution | `(string \| null)[]` | Runtime types for computed columns |

**Bun 1.3.3 Breaking Change:**
Bun 1.3.3 changed metadata access to require statement execution first. The adapter handles both patterns:
- **Bun < 1.3.0**: Access metadata pre-execution, execute with `stmt.values()`
- **Bun 1.3.3+**: Execute first with `stmt.values()`, then access metadata

**Type resolution priority:**
1. `declaredTypes` - Schema-based types (more specific: DATE vs DATETIME)
2. `columnTypes` - Runtime types for computed columns (COUNT, expressions)
3. **Value inference** - Infer from actual values when metadata unavailable (pragmas, edge cases)
4. Default to `Int32` as fallback

**Caveats:**
- `stmt.columnTypes` throws for non-read-only statements (INSERT/UPDATE/DELETE with RETURNING) and some pragmas (e.g., `PRAGMA journal_mode`)
- When both declared and runtime types are unavailable, we infer from the first row's actual values
- We handle this with a try-catch and value-based type inference fallback

**Why `stmt.values()` instead of `stmt.all()`:**
- `stmt.all()` returns objects → duplicate column names (JOINs) cause data loss
- `stmt.values()` returns arrays → preserves all columns in order

### PRAGMA Defaults

We set defensive defaults that official adapters don't:

| PRAGMA | Official | Ours | Why |
|--------|----------|------|-----|
| `foreign_keys` | OFF | **ON** | Prisma relations need FK constraints |
| `busy_timeout` | None | **5000ms** | Prevent immediate lock errors |
| WAL mode | None | Optional | Opt-in for performance |

## Comparison with Official Adapters

### vs `@prisma/adapter-better-sqlite3`

| Aspect | better-sqlite3 | Ours |
|--------|----------------|------|
| Runtime | Node.js | Bun |
| Dependencies | `better-sqlite3` (native) | Zero |
| Transaction locking | `async-mutex` package | Custom AsyncMutex |
| Column retrieval | `stmt.all()` + `stmt.columns()` | `stmt.values()` + metadata |
| Safe integers | Opt-in | **Default on** |
| FK constraints | Off | **On** |
| `lastInsertId` | Not returned | **Returned** |

### vs Official Rust Engine (quaint)

| Aspect | Rust Engine | Ours |
|--------|-------------|------|
| `BEGIN` type | `BEGIN IMMEDIATE` | `BEGIN` |
| DateTime default | Unix ms | ISO8601 |
| FK constraints | Off | **On** |
| busy_timeout | Manual | **5000ms** |

**Why `BEGIN` not `BEGIN IMMEDIATE`:**
The Rust engine uses `IMMEDIATE` to handle multiple connections. We have a mutex serializing transactions on a single connection, so plain `BEGIN` is sufficient.

**Why ISO8601 default:**
Human-readable, works with SQLite date functions. Users can opt into `unixepoch-ms` for performance.

## Migration Utilities

**`migration.ts`** provides programmatic migration support:

- `runMigrations()` - Apply migrations with tracking
- `createTestDatabase()` - Create `:memory:` DB with migrations
- `loadMigrationsFromDir()` - Load from filesystem
- `getAppliedMigrations()` / `getPendingMigrations()` - Query status

Uses Prisma-compatible `_prisma_migrations` table for tracking.

## Test Coverage

```
tests/
├── general.test.ts           # Core adapter (57 tests)
├── migrations.test.ts        # Migration utilities (12 tests)
├── shadow-database.test.ts   # Shadow DB support (9 tests)
├── wal-and-types.test.ts     # WAL + type tests (18 tests)
└── official-scenarios.test.ts # Prisma official scenarios (40 tests)

Total: 136 tests
```

**Test sources:**
- Core Prisma operations (CRUD, relations, transactions)
- Official Prisma test scenarios
- Edge cases from `prisma-engines/quaint` (Rust engine)
- Regression tests for v0.1.1 fixes

## Known Limitations

1. **Bun only** - Uses `bun:sqlite` native API
2. **Bun 1.2.17+** - Requires `stmt.declaredTypes`/`stmt.columnTypes` (added in 1.2.17)
3. **Local only** - No network support (use libsql for Turso)
4. **Single writer** - SQLite limitation, mitigated by AsyncMutex
5. **SERIALIZABLE only** - SQLite's only isolation level

## Non-Goals

### Connection Pooling

Connection pooling is a **non-goal by design**.

**Why it wouldn't help:**
- SQLite allows only one writer regardless of connection count
- `bun:sqlite` is synchronous at the native level
- JavaScript is single-threaded, so queries execute one-at-a-time in the event loop
- Multiple connections would add overhead with no concurrency gain

**Recommended architecture instead:**
Use two separate PrismaClient instances:
1. **Write client** - behind a sequential queue, ensuring one write operation at a time
2. **Read client** - for queries only, doesn't compete for write locks

This pattern correctly matches SQLite's single-writer/multiple-reader model without the complexity of connection pooling.

## References

- [Bun SQLite API](https://bun.sh/docs/api/sqlite)
- [Prisma Driver Adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers)
- [Official better-sqlite3 adapter](https://github.com/prisma/prisma/tree/main/packages/adapter-better-sqlite3)
- [SQLite error codes](https://www.sqlite.org/rescode.html)
