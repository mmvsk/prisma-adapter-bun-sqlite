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

**Status**: ✅ Complete - 51/51 tests passing

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for comprehensive implementation details.

**Key Files**:
- `src/bunsqlite-adapter.ts` - Main adapter implementation (611 lines)
- `tests/common/test-suite.ts` - Shared test suite (51 tests)
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

**Test Coverage**:
- 12 CRUD operation tests
- 6 relation tests (including cascade deletes)
- 9 filtering & querying tests
- 3 aggregation tests
- 3 transaction tests
- 4 raw query tests
- 7 type coercion tests
- 4 error handling tests
- 6 edge case tests

## Development Workflow

### Making Changes

1. **Edit source code**: `src/bunsqlite-adapter.ts`
2. **Run tests**: `bun test`
3. **Verify both adapters pass**: Both bunsqlite and libsql should pass all 51 tests

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

Uses manual `BEGIN`/`COMMIT`/`ROLLBACK` (not `db.transaction()`):

- Matches official better-sqlite3 adapter pattern
- Required for Prisma's transaction protocol
- `usePhantomQuery: true` needed for manual transaction management

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
  - `stmt.all()` - Get all rows
  - `stmt.run()` - Execute statement

## Common Issues

### "Transaction already closed"

**Cause**: `usePhantomQuery: false` incompatible with manual transactions
**Fix**: Keep `usePhantomQuery: true` (already set correctly)

### Foreign key constraints not working

**Cause**: `PRAGMA foreign_keys = ON` not set
**Fix**: Already set in factory's `connect()` method

### BLOB data not converting

**Cause**: Column type not detected as Bytes
**Fix**: Ensure PRAGMA query detects table correctly (check table name extraction regex)

### Boolean values wrong

**Cause**: SQLite stores booleans as 0/1
**Fix**: `mapArg()` already converts boolean → 0/1

## For More Information

- **User documentation**: [README.md](./README.md)
- **Implementation details**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Repository**: https://github.com/mmvsk/prisma-adapter-bunsqlite
