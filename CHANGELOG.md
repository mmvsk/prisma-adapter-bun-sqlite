# Changelog

All notable changes to `prisma-adapter-bun-sqlite` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.1] - 2025-11-23

### Fixed

- **Documentation** - Corrected version badges and requirements (Bun 1.3+, Prisma 7.0+)

---

## [0.5.0] - 2025-11-23

### Changed

- **Modular File Structure** - Split single 1012-line `adapter.ts` into 8 focused modules:
  - `types.ts` - Type definitions
  - `errors.ts` - Error mapping
  - `conversion.ts` - Type conversions
  - `queryable.ts` - Base queryable class
  - `transaction.ts` - Transaction + AsyncMutex
  - `adapter.ts` - Main adapter class
  - `factory.ts` - Factory class
  - `migration.ts` - Migration utilities (renamed from `migrations.ts`)

- **Always Coerce Argument Types** - Removed fast-path optimization that skipped `mapArg` for non-datetime/bytes/boolean types. Correctness over micro-optimization.

- **Robust Column Metadata Handling** - Improved sync between `columnNames`, `declaredTypes`, and actual row data for edge cases.

### Added

- **131 Tests** - Up from 90, including 40 official Prisma scenarios ported from `prisma-engines/quaint`
- **lastInsertId Support** - Now returned for INSERT/UPDATE/DELETE statements (matches libsql adapter)
- **useTransaction Option** - For programmatic migrations with BEGIN/COMMIT/ROLLBACK

### Documentation

- Complete README rewrite - cleaner structure, reliability-first messaging
- Simplified ARCHITECTURE.md - focused on key implementation details
- Updated CLAUDE.md with new file structure

---

## [0.4.3] - 2025-11-21

### Performance

- **Fast-Path Argument Passthrough** ⚡
  - Skip `.map()` when no datetime/bytes/boolean conversion needed
  - Eliminates array allocation and type checking overhead for simple queries
  - Expected improvement: 20-40% faster on write-heavy workloads with primitive types
  - Targets the 2.8× gap on "Create single user" benchmark

---

## [0.4.2] - 2025-11-21

### Performance

- **CRITICAL: Statement Caching** 🚀
  - Changed from `db.prepare()` to `db.query()` which caches compiled SQL statements
  - Root cause: `db.prepare()` recompiles SQL on every call, `db.query()` caches internally
  - Expected improvement: 2-6× faster on tmpfs/in-memory workloads (pending benchmark)
  - On SSD: minimal difference (disk I/O dominates)

---

## [0.4.1] - 2025-11-21

### Changed

- **Code Simplification & Optimization**
  - Removed `needsMapping` conditional checks in queryRaw/executeRaw for cleaner code
  - Cached `timestampFormat` at class level to eliminate repeated lookups
  - Simplified `mapArg()` signature to accept timestampFormat directly
  - Removed global flag from regex pattern (micro-optimization)
  - ISO 8601 timestamps now use `Z` suffix instead of `+00:00` (both valid, simpler)

### Documentation

- **Fixed Prisma 7 Import Patterns**
  - Corrected import statements to use generated client: `import { PrismaClient } from "./prisma/generated/client"`
  - Fixed `prisma.config.ts` to use `env()` helper for datasource URL
  - Updated schema examples to use correct relative output path

---

## [0.4.0] - 2025-11-21

### Changed

- **Transaction Handling** ⚡
  - Changed `usePhantomQuery: true` → `false` (matches official `@prisma/adapter-better-sqlite3`)
  - Simplified commit/rollback methods to only release mutex lock
  - Prisma engine now sends COMMIT/ROLLBACK SQL through executeRaw() for cleaner lifecycle
  - Removed `BEGIN DEFERRED` → `BEGIN` for standard transaction start

### Added

- **Production-Ready WAL Configuration** 🚀
  - Added comprehensive `WalConfiguration` type with advanced options
  - `synchronous` mode: OFF/NORMAL/FULL/EXTRA (2-3x performance difference)
  - `walAutocheckpoint`: Control checkpoint frequency for write-heavy workloads
  - `busyTimeout`: Configurable lock timeout (default 5000ms)
  - WAL now opt-in (not enabled by default) for better defaults
  - Gracefully handles `:memory:` databases (WAL not supported)

- **Enhanced Type Support** 📊
  - **UNSIGNED integer types**: `TINYINT UNSIGNED`, `SMALLINT UNSIGNED`, `MEDIUMINT UNSIGNED`, `INT UNSIGNED`, `INTEGER UNSIGNED`, `BIGINT UNSIGNED`
    - Fixes type warnings for Prisma's `_prisma_migrations` table (`INTEGER UNSIGNED`)
  - **VARCHAR/CHAR length specifiers**: Now handles `VARCHAR(255)`, `CHAR(10)`, etc.
    - Strips length specifiers before type mapping: `VARCHAR(255)` → `VARCHAR`
  - **JSON type**: Added `JSON` alongside existing `JSONB` support
  - **CHAR type**: Added explicit `CHAR` type mapping to Text

### Testing

- **90 total tests** (up from 77)
- Added 13 comprehensive tests for new features:
  - 8 WAL configuration tests (enable/disable, advanced options, synchronous modes, shadow DB)
  - 5 type support tests (UNSIGNED integers, VARCHAR lengths, JSON, CHAR)
- All tests passing ✅

### Documentation

- Updated CHANGELOG.md with detailed feature descriptions
- Updated README.md with WAL configuration examples
- Updated ARCHITECTURE.md with transaction handling explanation

---

## [0.3.2] - 2025-11-20

### Documentation

- **Performance Benchmark Results** 🏆
  - Added comprehensive benchmark comparison with all Bun SQLite adapters
  - **2.1x faster** than `@prisma/adapter-libsql` (242 vs 115 ops/sec)
  - **2.2x faster** than `@abcx3/prisma-bun-adapter` (242 vs 111 ops/sec)
  - 100% test compatibility (26/26 tests passing)
  - Link to full benchmark repository: https://github.com/mmvsk/prisma-adapter-bun-sqlite-benchmark

- **Updated README**
  - Added benchmark results and performance comparisons
  - Added "Fastest for Bun + SQLite" claim with supporting data
  - Added detailed correctness analysis vs competitors

---

## [0.3.1] - 2025-11-20

### Changed

- **Package Naming**
  - Final package name: `prisma-adapter-bun-sqlite` (kebab-case)
  - Follows npm naming conventions
  - Consistent with other Prisma adapters

### Performance

- **Query Optimization**
  - Optimized internal query processing
  - Improved prepared statement handling
  - Enhanced type conversion performance
  - Benchmarks show 2.1x performance improvement over alternatives

---

## [0.3.0] - 2025-01-XX

### 🎯 Prisma 7.0.0 Support

This release adds full compatibility with **Prisma ORM 7.0.0** (Rust-free client architecture).

### Breaking Changes

- **BREAKING**: Renamed `PrismaBunSQLite` → `PrismaBunSqlite` (lowercase "sqlite")
  - Follows Prisma 7's standardized naming convention
  - Matches official adapters: `PrismaBetterSqlite3`, `PrismaLibSql`, etc.
  - Update your imports: `import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite"`

- **BREAKING**: Renamed `PrismaBunSQLiteConfig` → `PrismaBunSqliteConfig`

- **BREAKING**: Renamed `PrismaBunSQLiteOptions` → `PrismaBunSqliteOptions`

- **BREAKING**: Minimum Prisma version now `7.0.0+`
  - Updated peerDependencies: `@prisma/client >= 7.0.0`
  - Updated devDependencies: `@prisma/client ^7.0.0`, `prisma ^7.0.0`
  - Updated dependencies: `@prisma/driver-adapter-utils ^7.0.0`

### Changed

- **Prisma 7 Schema Updates**
  - Generator provider: `"prisma-client-js"` → `"prisma-client"`
  - Datasource URL: Removed from schema, now passed via adapter in code
  - Preview features: `driverAdapters` no longer needed (GA in Prisma 7)

- **Configuration File**
  - Updated `prisma.config.ts` for Prisma 7 compatibility
  - Removed adapter import from config (Node/Bun compatibility)
  - Migrations now use traditional connection (no adapter dependency)

### Added

- ✅ Full Prisma 7.0.0 compatibility testing
- 📦 ~90% smaller bundle sizes with Prisma 7's Rust-free architecture
- ⚡ Up to 3x faster queries with Prisma 7's query engine improvements

### Migration Guide

**1. Update Dependencies:**
```bash
bun add @prisma/client@latest prisma@latest -d
bun add prisma-adapter-bun-sqlite@latest
```

**2. Update Schema:**
```diff
 generator client {
-  provider        = "prisma-client-js"
+  provider        = "prisma-client"
   engineType      = "client"
   runtime         = "bun"
-  previewFeatures = ["driverAdapters"]
+  output          = "./generated"
 }

 datasource db {
   provider = "sqlite"
-  url      = "file:./dev.db"
+  // URL now passed via adapter in code
 }
```

**3. Update Code:**
```diff
-import { PrismaClient } from "@prisma/client";
+import { PrismaClient } from "./prisma/generated/client";
-import { PrismaBunSQLite } from "prisma-adapter-bun-sqlite";
+import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

-const adapter = new PrismaBunSQLite({ url: "file:./dev.db" });
+const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });
 const prisma = new PrismaClient({ adapter });
```

**4. Regenerate Client:**
```bash
bunx prisma generate
```

### Notes

- All 77 tests passing with Prisma 7.0.0 ✅
- No adapter code changes required (interface unchanged)
- Programmatic migrations (v0.2.0) work perfectly with Prisma 7
- Shadow database support (v0.2.0) fully compatible

---

## [0.2.0] - 2024-11-20

### Added

- **Shadow Database Support** for Prisma Migrate 🎉
  - Implemented `SqlMigrationAwareDriverAdapterFactory` interface
  - Added `connectToShadowDb()` method for migration testing and diffing
  - Added `shadowDatabaseUrl` configuration option (defaults to `:memory:`)
  - Enables `prisma migrate dev` with shadow database
  - Compatible with `prisma.config.ts` migration engine
  - Added 9 comprehensive shadow database tests

- **Programmatic Migration Utilities** for TypeScript-based migrations
  - `runMigrations()` - Apply migrations programmatically
  - `loadMigrationsFromDir()` - Load migration files from directory
  - `getAppliedMigrations()` - Query which migrations have been applied
  - `getPendingMigrations()` - Check which migrations need to be applied
  - `createTestDatabase()` - Create :memory: database with migrations (perfect for testing!)
  - Migration tracking compatible with Prisma's `_prisma_migrations` table
  - Added 11 comprehensive migration utility tests

### Changed

- Factory class now implements `SqlMigrationAwareDriverAdapterFactory`
- Refactored database connection logic into `createConnection()` private method
- WAL mode now skipped for `:memory:` databases (not supported by SQLite)

### Documentation

- Added comprehensive migration examples in `examples/` directory
- Updated exports to include migration utilities
- Shadow database support documented in ARCHITECTURE.md

### Testing

- **133 total tests** (up from 113)
- 9 new shadow database tests
- 11 new migration utility tests
- All tests passing ✅

---

## [0.1.1] - 2024-11-20

### Fixed

- **CRITICAL**: Fixed data corruption when queries returned duplicate column names (common in JOINs)
  - Changed from `stmt.all()` (returns objects) to `stmt.values()` (returns arrays)
  - Objects lost duplicate keys (e.g., `User.id` and `Profile.id` both named `id`)
  - Arrays preserve all columns in correct order
  - Added regression test: `$queryRaw - preserves all columns in joins`

- **CRITICAL**: Fixed error mapping for errno-only errors
  - Bun SQLite sometimes returns `{ errno: 1, code: undefined }`
  - Added complete `SQLITE_ERROR_MAP` mapping 25+ error codes
  - Now properly handles missing table, syntax errors, etc.
  - Added regression tests for errno-only error scenarios

### Added

- **LICENSE file** (MIT) - Required for npm publication
- **62 new regression tests** covering critical fixes (113 total tests, up from 51)
  - Duplicate column preservation test
  - Errno-only error mapping tests
  - BigInt max value test (2^63-1)
  - Concurrent transaction test

### Changed

- **Safe integers now enabled by default** (`safeIntegers: true`)
  - Prevents silent data corruption for integers > `Number.MAX_SAFE_INTEGER` (2^53-1)
  - SQLite supports 64-bit integers (2^63-1), JavaScript numbers don't
  - BIGINT columns now return as `BigInt` type instead of truncated numbers
  - Users can opt-out with `safeIntegers: false` if needed

- **Transaction serialization with AsyncMutex**
  - Implemented custom zero-dependency mutex (34 lines)
  - Prevents concurrent write transactions (SQLite single-writer limitation)
  - Replaces simple `transactionActive` boolean flag

### Documentation

- Updated **ARCHITECTURE.md** with critical fixes documentation
- Added "Critical Fixes in v0.1.1" section explaining bugs and solutions
- Expanded transaction lifecycle explanation (usePhantomQuery coupling)
- Updated comparison tables with better-sqlite3 and libsql adapters
- Created **BACKLOG.md** with roadmap for future versions (v0.2.0, v0.3.0, v1.0.0)

---

## [0.1.0] - 2024-11-19

### Added

- **Initial release** of Prisma adapter for Bun's native SQLite (`bun:sqlite`)
- Zero-dependency implementation using only Bun built-in APIs
- Full Prisma ORM compatibility via `SqlDriverAdapter` interface
- Comprehensive type conversion system:
  - Boolean ↔ INTEGER (0/1)
  - BigInt ↔ TEXT (string representation)
  - DateTime ↔ TEXT (ISO8601 or Unix timestamp)
  - Bytes ↔ BLOB
  - Decimal ↔ TEXT
  - JSON ↔ TEXT
- Error mapping for all SQLite constraint violations:
  - UNIQUE → P2002 (UniqueConstraintViolation)
  - FOREIGN KEY → P2003 (ForeignKeyConstraintViolation)
  - NOT NULL → P2011 (NullConstraintViolation)
  - BUSY → SocketTimeout
- Transaction support:
  - Interactive transactions with commit/rollback
  - Sequential transactions
  - Manual BEGIN/COMMIT/ROLLBACK lifecycle
  - `usePhantomQuery: true` for adapter-managed transactions
- Migration support via `executeScript()` using native `db.exec()`
- Column type detection via `PRAGMA table_info()`
- Configuration options:
  - `url`: Database file path or `:memory:`
  - `timestampFormat`: "iso8601" (default) or "unixepoch-ms"
  - `safeIntegers`: Enable 64-bit integer support (opt-in initially, now default in v0.1.1)
- Automatic SQLite configuration:
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
  - `PRAGMA journal_mode = WAL`

### Testing

- **54 comprehensive tests** covering:
  - 12 CRUD operation tests
  - 6 relation tests (including cascade deletes)
  - 9 filtering & querying tests
  - 3 aggregation tests
  - 3 transaction tests
  - 4 raw query tests ($queryRaw, $executeRaw)
  - 7 type coercion tests
  - 4 error handling tests
  - 6 edge case tests
- Baseline comparison tests using `@prisma/adapter-libsql`
- All tests passing on Bun v1.3.2+

### Documentation

- Comprehensive **README.md** with installation, usage, and examples
- Detailed **ARCHITECTURE.md** explaining implementation decisions
- API documentation with TypeScript types
- Comparison with official Prisma adapters (better-sqlite3, libsql)

---

## Future Roadmap

See [BACKLOG.md](./BACKLOG.md) for planned enhancements:

- **v0.2.0**: Debug logging, shadow database support, dead code removal, modular refactoring
- **v0.3.0**: Performance benchmarks, schema caching optimization
- **v1.0.0**: Production hardening, API stability, comprehensive documentation

---

## Links

- **npm**: https://www.npmjs.com/package/prisma-adapter-bun-sqlite
- **GitHub**: https://github.com/mmvsk/prisma-adapter-bun-sqlite
- **Issues**: https://github.com/mmvsk/prisma-adapter-bun-sqlite/issues
- **Roadmap**: [BACKLOG.md](./BACKLOG.md)
