# Project: Prisma Adapter for Bun SQLite

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Project Overview

This is a production-ready Prisma driver adapter for Bun's native SQLite API (`bun:sqlite`). The adapter provides zero-dependency SQLite support for Prisma ORM in Bun environments.

**Status**: ✅ Production Ready - v0.4.0 - 90/90 tests passing - **Prisma 7.0.0+ Compatible**

## What's New in v0.4.0

- **⚡ Fixed Transaction Handling** - Changed `usePhantomQuery: true` → `false` (matches official @prisma/adapter-better-sqlite3)
- **🚀 WAL Configuration** - Added production-ready WAL mode options (synchronous, busyTimeout, walAutocheckpoint)
- **📊 Enhanced Type Support** - Added UNSIGNED integers, VARCHAR lengths, JSON, CHAR types
- **🧪 13 New Tests** - Comprehensive WAL and type support testing (90 total, up from 77)

## What's New in v0.3.0

- **🎯 Prisma 7 Support** - Full compatibility with Prisma ORM 7.0.0+ (Rust-free client)
- **📦 Naming Convention** - Updated to `PrismaBunSqlite` (follows Prisma 7 standardized naming)
- **⚡ Smaller Bundles** - ~90% smaller with Prisma 7's Rust-free architecture
- **🚀 Faster Queries** - Up to 3x faster with Prisma 7's query engine improvements

## What's New in v0.2.0

- **🔄 Shadow Database Support** - Full `prisma migrate dev` compatibility
- **⚡ Programmatic Migrations** - Run migrations from TypeScript for :memory: testing
- **🧪 Lightning Fast Tests** - Create fresh :memory: databases with migrations in milliseconds
- **📦 Standalone Binaries** - Embed migrations in Bun binaries with zero runtime dependencies

## Quick Links

- **[CHANGELOG.md](./CHANGELOG.md)** - Release notes and version history (what changed)
- **[BACKLOG.md](./BACKLOG.md)** - Future roadmap and planned enhancements (what's next)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Implementation details and design decisions (how it works)

**Key Files**:
- `src/adapter.ts` - Main adapter implementation
- `src/migrations.ts` - Migration utilities (v0.2.0+)
- `src/index.ts` - Public exports
- `tests/general.test.ts` - Core adapter tests (57 tests)
- `tests/migrations.test.ts` - Migration utilities tests (11 tests)
- `tests/shadow-database.test.ts` - Shadow DB tests (9 tests)
- `tests/wal-and-types.test.ts` - WAL and type support tests (13 tests)

**Key Classes**:
- `PrismaBunSqlite` - Factory class implementing `SqlMigrationAwareDriverAdapterFactory`
- `BunSqliteAdapter` - Main adapter implementing `SqlDriverAdapter`
- `BunSqliteQueryable` - Base class with query/execute methods
- `BunSqliteTransaction` - Transaction handling

**Migration Utilities (v0.2.0+)**:
- `runMigrations()` - Apply migrations programmatically
- `createTestDatabase()` - Create :memory: DB with migrations
- `loadMigrationsFromDir()` - Load migrations from filesystem
- `getAppliedMigrations()` - Query applied migrations
- `getPendingMigrations()` - Check pending migrations

## Testing

Run tests with:

```bash
# All tests (90 tests total)
bun test

# Core adapter only
bun test tests/general.test.ts

# Migration utilities only
bun test tests/migrations.test.ts

# Shadow database only
bun test tests/shadow-database.test.ts

# WAL and type support only
bun test tests/wal-and-types.test.ts
```

**Test Coverage** (90 tests total):

**General Tests (57 tests):**
- 12 CRUD operation tests
- 6 relation tests (including cascade deletes)
- 9 filtering & querying tests
- 3 aggregation tests
- 3 transaction tests (commit, rollback, sequential)
- 4 raw query tests ($queryRaw, $executeRaw)
- 7 type coercion tests (DateTime, BigInt, Boolean, Decimal, JSON, Bytes)
- 4 error handling tests (P2002, P2003, P2025, P2011)
- 6 edge case tests
- Plus regression tests for v0.1.1 critical fixes

**Migration Tests (11 tests):**
- runMigrations applies migrations to database
- runMigrations skips already applied migrations
- runMigrations tracks in _prisma_migrations table
- getAppliedMigrations returns list of applied
- getPendingMigrations returns unapplied
- createTestDatabase creates :memory: with migrations
- Complex SQL with comments support
- Idempotent migration runs
- Foreign key constraint preservation

**Shadow Database Tests (9 tests):**
- Shadow DB creates separate adapter instances
- Shadow DB defaults to :memory:
- Shadow DB supports custom URL
- Shadow DB isolated from main database
- Shadow DB supports executeScript for migrations
- Shadow DB can be used multiple times
- Shadow DB inherits safeIntegers config
- Shadow DB inherits timestampFormat config
- Shadow DB works with prisma.config.ts

**WAL and Type Support Tests (13 tests):**
- WAL disabled by default
- WAL enable with `wal: true`
- Advanced WAL options (synchronous, busyTimeout, walAutocheckpoint)
- Different synchronous modes (OFF, NORMAL, FULL, EXTRA)
- Memory database ignores WAL gracefully
- Shadow database with WAL
- INTEGER UNSIGNED handling (Prisma migrations table)
- All UNSIGNED integer variants
- VARCHAR with length specifiers
- Common Prisma schema types
- JSON and JSONB types
- CHAR type variants

## Development Workflow

### Making Changes

1. **Edit source code**: `src/adapter.ts` or `src/migrations.ts`
2. **Run tests**: `bun test`
3. **Verify all tests pass**: All 90 tests should pass (57 general + 11 migrations + 9 shadow DB + 13 WAL/types)

### Adding Features

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand design decisions
2. Follow existing patterns (match official Prisma adapter style)
3. Add tests to appropriate test file:
   - Core adapter features → `tests/general.test.ts`
   - Migration utilities → `tests/migrations.test.ts`
   - Shadow DB features → `tests/shadow-database.test.ts`
4. Update documentation in README.md and ARCHITECTURE.md

### Prisma Schema Changes

The test schema is in `prisma/schema.prisma`. After changes:

```bash
# Regenerate Prisma Client
bunx prisma generate

# Create new migration (if needed)
bunx prisma migrate dev --name your_migration_name
```

**Important**: Don't modify the generator config in schema.prisma - it's configured for Bun runtime.

## Key Implementation Details

### Shadow Database Support (v0.2.0+)

The factory class implements `SqlMigrationAwareDriverAdapterFactory`:

```typescript
export class PrismaBunSqlite implements SqlMigrationAwareDriverAdapterFactory {
  async connectToShadowDb(): Promise<SqlDriverAdapter> {
    const shadowUrl = this.config.shadowDatabaseUrl ?? ":memory:";
    const db = this.createConnection(shadowUrl);
    return new BunSqliteAdapter(db, this.config);
  }
}
```

**Key features:**
- Defaults to `:memory:` for maximum speed
- Fully isolated from main database
- Inherits all config options (safeIntegers, timestampFormat, wal)
- WAL mode automatically disabled for :memory: databases

### WAL Configuration (v0.4.0+)

Comprehensive Write-Ahead Logging configuration for production workloads:

```typescript
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  wal: {
    enabled: true,
    synchronous: "NORMAL",      // 2-3x faster than FULL
    walAutocheckpoint: 2000,    // Checkpoint every 2000 pages
    busyTimeout: 10000          // 10 second lock timeout
  }
});
```

**Key features:**
- WAL disabled by default (opt-in for better defaults)
- Configurable synchronous mode: OFF/NORMAL/FULL/EXTRA (2-3x performance difference)
- Control checkpoint frequency for write-heavy workloads
- Customizable lock timeout for concurrent access
- Gracefully ignored for `:memory:` databases (WAL not supported)

### Programmatic Migrations (v0.2.0+)

New module `src/migrations.ts` provides:

```typescript
// Create test database with migrations (perfect for tests!)
const adapter = await createTestDatabase([
  { name: "001_init", sql: "CREATE TABLE users (...);" }
]);

// Load and run migrations from filesystem
const migrations = await loadMigrationsFromDir("./prisma/migrations");
await runMigrations(adapter, migrations);

// Check migration status
const applied = await getAppliedMigrations(adapter);
const pending = await getPendingMigrations(adapter, allMigrations);
```

**Migration Tracking:**
Uses Prisma-compatible `_prisma_migrations` table for tracking applied migrations.

### Prisma 7 Migration Architecture (Important!)

**In Prisma 7, there's a separation between CLI and runtime:**

**CLI Operations (Rust Engine):**
```bash
bunx prisma migrate dev    # Uses Rust engine + prisma.config.ts
bunx prisma db push        # Uses Rust engine + prisma.config.ts
bunx prisma db pull        # Uses Rust engine + prisma.config.ts
```

These commands use the traditional Rust query engine with the datasource URL from `prisma.config.ts`:

```typescript
// prisma.config.ts - for CLI tools only
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasources: {
    db: { url: process.env.DATABASE_URL || "file:./dev.db" }
  }
});
```

**Runtime Operations (Your Adapter):**
```typescript
// Your application code - uses adapter
const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });
await prisma.user.findMany(); // Uses your Bun adapter
```

**Why This Matters:**
- ✅ Migrations work with standard Prisma tooling (no Node/Bun compatibility issues)
- ✅ Runtime uses your fast Bun adapter (90% smaller, 3x faster)
- ✅ Config file stays Node-compatible (no `bun:sqlite` import needed)
- ✅ Programmatic migrations (v0.2.0) perfect for standalone binaries

**For Standalone Deployments:**
Use our programmatic migration utilities instead of CLI commands:
```typescript
const migrations = await loadMigrationsFromDir("./prisma/migrations");
await runMigrations(adapter, migrations);
```

### Type Conversions

The adapter handles all Prisma ↔ SQLite type conversions:

- **Boolean**: `true/false` ↔ `1/0` (SQLite has no boolean type)
- **BigInt**: `12345678901234n` ↔ `"12345678901234"` (stored as TEXT)
- **DateTime**: `Date` ↔ ISO8601 string or Unix timestamp (configurable)
- **Bytes**: `Buffer/Uint8Array` ↔ `BLOB` (with base64 encoding support)
- **Decimal**: `Decimal` ↔ `TEXT` (SQLite has no decimal type)
- **Json**: `object` ↔ `TEXT` (JSON string)

### Error Mapping

SQLite errors are automatically mapped to Prisma error codes:

- `SQLITE_CONSTRAINT_UNIQUE` → `UniqueConstraintViolation` (P2002)
- `SQLITE_CONSTRAINT_FOREIGNKEY` → `ForeignKeyConstraintViolation` (P2003)
- `SQLITE_CONSTRAINT_NOTNULL` → `NullConstraintViolation` (P2011)
- `SQLITE_BUSY` → `SocketTimeout`

### Transaction Handling

Uses manual `BEGIN`/`COMMIT`/`ROLLBACK` with `usePhantomQuery: true`:

- **Design choice**: Adapter controls transaction lifecycle (not Prisma Engine)
- Matches `@prisma/adapter-libsql` pattern (official adapter)
- Different from `@prisma/adapter-better-sqlite3` which uses `usePhantomQuery: false`
- Both patterns are valid - see [ARCHITECTURE.md](./ARCHITECTURE.md#6-transaction-management) for details
- Uses custom AsyncMutex (34 lines) to serialize transactions (SQLite single-writer limitation)

### Column Type Detection

Uses `PRAGMA table_info()` to get schema-declared types:

1. Extract table names from SQL (regex pattern matches FROM, JOIN, INSERT INTO, UPDATE)
2. Query `PRAGMA table_info("tableName")` for each table
3. Map SQLite types to Prisma ColumnType enum
4. Fall back to type inference from data if needed

### Script Execution

Uses native `db.exec()` for migrations and shadow database operations:

- Handles multiple statements correctly
- Properly parses SQL (handles semicolons in strings)
- Matches official adapter behavior
- Works with both main database and shadow database

## Configuration

The adapter automatically configures SQLite with:

```typescript
PRAGMA foreign_keys = ON        // Enable FK constraints (required for cascades)
PRAGMA busy_timeout = 5000      // 5 second lock timeout (default if WAL not configured)
```

**Optional: WAL mode** (opt-in, v0.4.0+):

```typescript
// If wal: true or wal: { enabled: true }
PRAGMA journal_mode = WAL              // Write-Ahead Logging
PRAGMA synchronous = <config>          // Configurable (OFF/NORMAL/FULL/EXTRA)
PRAGMA wal_autocheckpoint = <config>   // Configurable checkpoint frequency
PRAGMA busy_timeout = <config>         // Configurable lock timeout
```

**Factory Configuration:**

```typescript
const adapter = new PrismaBunSqlite({
  url: "file:./dev.db",
  shadowDatabaseUrl: ":memory:",  // Optional, defaults to :memory:
  safeIntegers: true,              // Optional, defaults to true
  timestampFormat: "iso8601",      // Optional, defaults to "iso8601"
  wal: {                           // Optional, defaults to disabled
    enabled: true,
    synchronous: "NORMAL",
    walAutocheckpoint: 2000,
    busyTimeout: 10000
  }
});
```

## Deployment

The adapter works with:

- **Bun standalone binaries**: `bun build --compile` (v0.2.0+ can embed migrations!)
- **Docker**: Use `oven/bun:1.3.2` image
- **Serverless**: Works in any Bun environment

**v0.2.0 Deployment Strategies:**

See `examples/README.md` for comprehensive guides on:
- Embedding migrations in standalone binaries
- Bundling Prisma migrations at build time
- :memory: database testing patterns

## Comparison with Official Adapters

See [ARCHITECTURE.md](./ARCHITECTURE.md#comparison-with-official-adapters) for detailed comparison.

**Summary**:
- **vs better-sqlite3**: Same patterns, zero dependencies, Bun-native
- **vs libsql**: Local-only, synchronous, better performance for file-based usage

## Reference Materials

- Official better-sqlite3 adapter: `/home/rmx/tmp/official-adapter-better-sqlite3/`
- Prisma Driver Adapter Utils: `node_modules/@prisma/driver-adapter-utils/`
- Bun SQLite API: https://bun.sh/docs/api/sqlite
- SQLite Documentation: https://www.sqlite.org/docs.html

## Debugging Tips

### Enable Query Logging

In Prisma Client:
```typescript
const prisma = new PrismaClient({
  adapter,
  log: ['query', 'info', 'warn', 'error'],
});
```

### Check Generated SQL

Tests show actual SQL generated by Prisma, useful for debugging type issues.

### Verify Database State

```bash
# Open database with Bun
bun -e 'import { Database } from "bun:sqlite"; const db = new Database("./prisma/dev.db"); console.log(db.query("SELECT * FROM User").all())'
```

## Bun APIs Used

- `bun:sqlite` - Native SQLite API
  - `Database` class
  - `db.prepare()` - Prepared statements
  - `db.run()` - Execute SQL
  - `db.exec()` - Execute script (used for migrations and shadow DB)
  - `stmt.values()` - Get all rows as arrays (v0.1.1+, prevents duplicate column data loss)
  - `stmt.run()` - Execute statement
  - `(stmt as any).columnNames` - Undocumented API for column names
  - `(stmt as any).declaredTypes` - Undocumented API for column types
- `node:crypto` - For generating migration checksums (v0.2.0+)
- `node:fs/promises` - For reading migration files (v0.2.0+)

## Common Issues

### Data corruption on JOINs (FIXED in v0.1.1)

**Symptom**: Duplicate column names in query results (e.g., `User.id` and `Profile.id`) return same value
**Cause**: Was using `stmt.all()` which returns objects, losing duplicate keys
**Fix**: ✅ Changed to `stmt.values()` which returns arrays, preserving all columns

### Error not wrapped as Prisma error (FIXED in v0.1.1)

**Symptom**: SQLite errors (missing table, syntax errors) not showing as proper Prisma errors
**Cause**: Bun returns `{ errno: 1, code: undefined }` for most errors, adapter only checked `.code`
**Fix**: ✅ Added complete `SQLITE_ERROR_MAP` mapping errno → code

### `prisma migrate dev` not working (FIXED in v0.2.0)

**Symptom**: `prisma migrate dev` fails with shadow database errors
**Cause**: Adapter didn't implement `SqlMigrationAwareDriverAdapterFactory`
**Fix**: ✅ v0.2.0 adds full shadow database support via `connectToShadowDb()`

### Slow tests with file-based databases (FIXED in v0.2.0)

**Symptom**: Tests are slow because they use file-based databases
**Cause**: File I/O overhead for database creation and cleanup
**Fix**: ✅ v0.2.0 adds `createTestDatabase()` for :memory: databases with migrations (10-100x faster!)

### "Transaction already closed"

**Cause**: `usePhantomQuery: false` incompatible with manual BEGIN/COMMIT/ROLLBACK
**Fix**: Keep `usePhantomQuery: true` (already set correctly)

### Foreign key constraints not working

**Cause**: `PRAGMA foreign_keys = ON` not set
**Fix**: Already set in factory's `connect()` method

### Large integer precision loss (FIXED in v0.1.1)

**Symptom**: Values > 2^53-1 lose precision
**Cause**: JavaScript numbers can't represent 64-bit integers safely
**Fix**: ✅ `safeIntegers: true` by default (opt-out with `safeIntegers: false` if needed)

### Boolean values wrong

**Cause**: SQLite stores booleans as 0/1
**Fix**: `mapArg()` already converts boolean → 0/1

## For More Information

- **User documentation**: [README.md](./README.md)
- **Implementation details**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Release notes**: [CHANGELOG.md](./CHANGELOG.md) - What changed in each version
- **Future roadmap**: [BACKLOG.md](./BACKLOG.md) - Planned features and improvements
- **Repository**: https://github.com/mmvsk/prisma-adapter-bun-sqlite
