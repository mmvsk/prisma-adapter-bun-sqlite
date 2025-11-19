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

**Status**: ✅ Production Ready - v0.1.1 - 113/113 tests passing

## Quick Links

- **[CHANGELOG.md](./CHANGELOG.md)** - Release notes and version history (what changed)
- **[BACKLOG.md](./BACKLOG.md)** - Future roadmap and planned enhancements (what's next)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Implementation details and design decisions (how it works)

**Key Files**:
- `src/bunsqlite-adapter.ts` - Main adapter implementation (~680 lines)
- `tests/common/test-suite.ts` - Shared test suite (113 tests)
- `tests/bunsqlite-adapter.test.ts` - BunSQLite adapter tests
- `tests/libsql-adapter.test.ts` - LibSQL adapter tests (baseline)

**Key Classes**:
- `PrismaBunSQLite` - Factory class for creating adapter instances
- `BunSQLiteAdapter` - Main adapter implementing `SqlDriverAdapter`
- `BunSQLiteQueryable` - Base class with query/execute methods
- `BunSQLiteTransaction` - Transaction handling

## Testing

Run tests with:

```bash
# All tests (both adapters)
bun test

# BunSQLite adapter only
bun test tests/bunsqlite-adapter.test.ts

# LibSQL adapter (baseline)
bun test tests/libsql-adapter.test.ts
```

**Test Coverage** (113 tests total):
- 12 CRUD operation tests
- 6 relation tests (including cascade deletes)
- 9 filtering & querying tests
- 3 aggregation tests
- 3 transaction tests (including concurrent transaction test)
- 4 raw query tests ($queryRaw, $executeRaw)
- 7 type coercion tests (including BigInt max value)
- 4 error handling tests (including errno-only error tests)
- 6 edge case tests
- Plus v0.1.1 regression tests for critical fixes

## Development Workflow

### Making Changes

1. **Edit source code**: `src/bunsqlite-adapter.ts`
2. **Run tests**: `bun test`
3. **Verify both adapters pass**: Both bunsqlite and libsql should pass all tests (113 for bunsqlite, 110 for libsql with 3 adapter-specific skips)

### Adding Features

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand design decisions
2. Follow existing patterns (match official Prisma adapter style)
3. Add tests to `tests/common/test-suite.ts` (so both adapters run them)
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

Uses native `db.exec()` for migrations:

- Handles multiple statements correctly
- Properly parses SQL (handles semicolons in strings)
- Matches official adapter behavior

## Configuration

The adapter automatically configures SQLite with:

```typescript
PRAGMA foreign_keys = ON        // Enable FK constraints (required for cascades)
PRAGMA busy_timeout = 5000      // 5 second lock timeout
PRAGMA journal_mode = WAL       // Write-Ahead Logging (performance)
```

## Deployment

The adapter works with:

- **Bun standalone binaries**: `bun build --compile`
- **Docker**: Use `oven/bun:1.3.2` image
- **Serverless**: Works in any Bun environment

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
  - `db.exec()` - Execute script
  - `stmt.values()` - Get all rows as arrays (v0.1.1+, prevents duplicate column data loss)
  - `stmt.run()` - Execute statement
  - `(stmt as any).columnNames` - Undocumented API for column names
  - `(stmt as any).declaredTypes` - Undocumented API for column types

## Common Issues

### Data corruption on JOINs (FIXED in v0.1.1)

**Symptom**: Duplicate column names in query results (e.g., `User.id` and `Profile.id`) return same value
**Cause**: Was using `stmt.all()` which returns objects, losing duplicate keys
**Fix**: ✅ Changed to `stmt.values()` which returns arrays, preserving all columns

### Error not wrapped as Prisma error (FIXED in v0.1.1)

**Symptom**: SQLite errors (missing table, syntax errors) not showing as proper Prisma errors
**Cause**: Bun returns `{ errno: 1, code: undefined }` for most errors, adapter only checked `.code`
**Fix**: ✅ Added complete `SQLITE_ERROR_MAP` mapping errno → code

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
- **Repository**: https://github.com/mmvsk/prisma-adapter-bunsqlite
