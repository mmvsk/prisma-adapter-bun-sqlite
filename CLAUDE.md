# Project: prisma-adapter-bun-sqlite

Reliable, fast, zero-dependency Prisma adapter for Bun's native SQLite.

## Bun-First Development

- Use `bun` instead of `node` or `ts-node`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Bun automatically loads `.env`

## Project Status

**v0.6.8** - 158/158 tests passing

## Compatibility

- **Bun**: 1.3.0+ (minimum required)
- **Prisma**: 7.0+
- **Note**: Bun 1.3.0+ requires statement execution before accessing metadata. The adapter uses the post-execution metadata pattern.

## File Structure

```
src/
├── index.ts          # Public exports
├── types.ts          # Type definitions
├── errors.ts         # Error mapping (SQLite → Prisma)
├── conversion.ts     # Type conversions (mapArg, mapRow)
├── queryable.ts      # BunSqliteQueryable base class
├── transaction.ts    # BunSqliteTransaction + AsyncMutex
├── adapter.ts        # BunSqliteAdapter class
├── factory.ts        # PrismaBunSqlite factory
├── migration.ts      # Programmatic migration utilities
└── sanity-check.ts   # Runtime validation (checkWalMode, checkForeignKeys)

tests/
├── general.test.ts           # Core adapter (57 tests)
├── migrations.test.ts        # Migration utilities (12 tests)
├── shadow-database.test.ts   # Shadow DB (9 tests)
├── wal-and-types.test.ts     # WAL + types (18 tests)
├── official-scenarios.test.ts # Official Prisma scenarios (40 tests)
├── sanity-check.test.ts      # Sanity check utilities (11 tests)
└── benchmark.ts              # Performance benchmark (not a test file)
```

## Key Classes

| Class | File | Purpose |
|-------|------|---------|
| `PrismaBunSqlite` | `factory.ts` | Factory, creates adapters |
| `BunSqliteAdapter` | `adapter.ts` | Main adapter |
| `BunSqliteQueryable` | `queryable.ts` | Base class (queryRaw, executeRaw) |
| `BunSqliteTransaction` | `transaction.ts` | Transaction handling |
| `AsyncMutex` | `transaction.ts` | Serialize transactions |

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `mapArg()` | `conversion.ts` | Prisma → SQLite args |
| `mapRow()` | `conversion.ts` | SQLite → Prisma rows |
| `getColumnTypes()` | `conversion.ts` | Column type detection |
| `inferTypeFromValue()` | `conversion.ts` | Infer type from value (fallback) |
| `convertDriverError()` | `errors.ts` | SQLite → Prisma errors |
| `runMigrations()` | `migration.ts` | Apply migrations |
| `createTestDatabase()` | `migration.ts` | :memory: DB with migrations |
| `checkWalMode()` | `sanity-check.ts` | Verify WAL mode is enabled |
| `checkForeignKeys()` | `sanity-check.ts` | Verify FK constraints are enabled |

## Testing

```bash
bun tsc --noEmit && bun test  # Typecheck + all tests
bun test tests/general.test.ts  # Core adapter only
```

## Benchmarking

```bash
bun run benchmark              # In-memory, key/value output
bun run benchmark --json       # JSON to stdout
bun run benchmark --json out.json  # JSON to file
bun run benchmark --fs         # File-based database
```

Use benchmarks to measure performance impact of changes (e.g., optimizations).

## Development Workflow

1. Edit source in `src/`
2. Run `bun tsc --noEmit` to typecheck
3. Run `bun test` to run all tests
4. Both must pass before committing

**Always run before committing:**
```bash
bun tsc --noEmit && bun test
```

## Key Design Decisions

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

1. **`usePhantomQuery: false`** - Prisma sends COMMIT/ROLLBACK SQL
2. **`stmt.values()`** - Preserves duplicate columns in JOINs
3. **`safeIntegers: true`** - Prevent BigInt precision loss
4. **`foreign_keys=ON`** - Enable FK constraints by default
5. **ISO8601 timestamps** - Human-readable, SQLite function compatible

## Type Conversions

| Prisma | SQLite | Notes |
|--------|--------|-------|
| Boolean | INTEGER | 0/1 |
| BigInt | TEXT | String for safety |
| DateTime | TEXT/INTEGER | ISO8601 or Unix ms |
| Decimal | TEXT | No native decimal |
| Bytes | BLOB | Uint8Array |

## Error Mapping

| SQLite | Prisma |
|--------|--------|
| `SQLITE_CONSTRAINT_UNIQUE` | P2002 |
| `SQLITE_CONSTRAINT_FOREIGNKEY` | P2003 |
| `SQLITE_CONSTRAINT_NOTNULL` | P2011 |
| `SQLITE_BUSY` | Timeout |

## PRAGMA Defaults

```sql
PRAGMA foreign_keys = ON      -- Enable FK constraints
PRAGMA busy_timeout = 5000    -- 5s lock timeout
```

WAL mode is opt-in via `wal: true` or `wal: { enabled: true, ... }`.

## Migration Utilities

```typescript
// Create :memory: database with migrations (for tests)
const adapter = await createTestDatabase([
  { name: "001_init", sql: "CREATE TABLE users (...);" }
]);

// Load and apply from filesystem
const migrations = await loadMigrationsFromDir("./prisma/migrations");
await runMigrations(adapter, migrations);
```

## Sanity Check Utilities

Separate import from `prisma-adapter-bun-sqlite/sanity-check`:

```typescript
import { checkWalMode, checkForeignKeys } from "prisma-adapter-bun-sqlite/sanity-check";

// At application startup
await checkForeignKeys(prisma);  // Throws if foreign_keys != 1
await checkWalMode(prisma);      // Throws if journal_mode != "wal"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Data corruption in JOINs | Fixed: using `stmt.values()` |
| Error not wrapped | Fixed: errno→code mapping |
| FK constraints not working | Set by default in factory |
| BigInt precision loss | `safeIntegers: true` by default |

## Documentation

- [README.md](./README.md) - User documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Implementation details
- [CHANGELOG.md](./CHANGELOG.md) - Release notes
- [BACKLOG.md](./BACKLOG.md) - Future improvements
