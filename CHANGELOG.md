# Changelog

All notable changes to `prisma-adapter-bunsqlite` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- **npm**: https://www.npmjs.com/package/prisma-adapter-bunsqlite
- **GitHub**: https://github.com/mmvsk/prisma-adapter-bunsqlite
- **Issues**: https://github.com/mmvsk/prisma-adapter-bunsqlite/issues
- **Roadmap**: [BACKLOG.md](./BACKLOG.md)
