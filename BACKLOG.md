# Development Backlog

This document tracks future improvements, enhancements, and optimizations for `prisma-adapter-bunsqlite`.

---

## v0.1.1 ✅ COMPLETED

### Critical Bugs Fixed
- ✅ Data corruption on joins (duplicate column names)
- ✅ Error mapping for errno-only errors
- ✅ Missing LICENSE file
- ✅ Added regression tests (113 tests total)

**Status**: Published and production-ready

---

## v0.2.0 - Code Quality & Features ✅ COMPLETED

### What Was Released

#### 1. Shadow Database Support ✅ DONE
**Status**: ✅ **COMPLETED** in v0.2.0

**What was implemented**:
- ✅ `SqlMigrationAwareDriverAdapterFactory` interface
- ✅ `connectToShadowDb()` method
- ✅ `shadowDatabaseUrl` config option (defaults to `:memory:`)
- ✅ Works with `prisma.config.ts` and JS engine
- ✅ Full `prisma migrate dev` support
- ✅ 9 comprehensive shadow database tests

**Result**: Full Prisma Migrate compatibility!

---

#### 2. Programmatic Migration Utilities ✅ DONE
**Status**: ✅ **COMPLETED** in v0.2.0

**What was implemented**:
- ✅ `src/migrations.ts` - Complete migration toolkit (372 lines)
- ✅ `runMigrations()` - Apply migrations programmatically
- ✅ `loadMigrationsFromDir()` - Load from filesystem
- ✅ `getAppliedMigrations()` - Query applied migrations
- ✅ `getPendingMigrations()` - Check pending migrations
- ✅ `createTestDatabase()` - :memory: DB with migrations
- ✅ 11 comprehensive migration utility tests

**Result**: Lightning-fast :memory: testing + embedded migrations for standalone binaries!

---

#### 3. Type System Cleanup ✅ DONE
**Status**: ✅ **COMPLETED** in v0.2.0

**What was fixed**:
- ✅ Renamed `PrismaBunSqlite3Options` → `PrismaBunSqliteOptions` (consistent naming)
- ✅ Simplified type structure (Options vs Config is now clear)
- ✅ Added better JSDoc comments
- ✅ All TypeScript errors fixed

**Result**: Clean, consistent type naming throughout!

---

#### 4. Test Suite Simplification ✅ DONE
**Status**: ✅ **COMPLETED** in v0.2.0

**What was changed**:
- ✅ Removed `@prisma/adapter-libsql` dependency (was only for baseline comparison)
- ✅ Consolidated `tests/common/test-suite.ts` → `tests/general.test.ts`
- ✅ Removed `tests/bunsqlite-adapter.test.ts` and `tests/libsql-adapter.test.ts` wrappers
- ✅ Fixed all TypeScript strict mode errors
- ✅ 77 tests passing (57 general + 11 migrations + 9 shadow DB)

**Result**: Simpler test structure, faster CI, cleaner codebase!

---

#### 5. Documentation Updates ✅ DONE
**Status**: ✅ **COMPLETED** in v0.2.0

**What was updated**:
- ✅ CHANGELOG.md - Comprehensive v0.2.0 entry
- ✅ prisma.config.ts - Now uses JS engine with adapter
- ✅ examples/ - 4 comprehensive examples created
- ✅ src/index.ts - Exports migration utilities

**Result**: Complete documentation for all new features!

---

### Summary

**v0.2.0 is COMPLETE and ready to publish!** 🎉

All planned items delivered:
- ✅ Shadow database support
- ✅ Programmatic migrations
- ✅ Type naming fixed
- ✅ Tests simplified
- ✅ Documentation complete
- ✅ 77/77 tests passing
- ✅ Zero TypeScript errors

---

## v0.3.0 - Prisma 7 Support ✅ COMPLETED

### What Was Released

#### 1. Prisma 7.0.0 Compatibility ✅ DONE
**Status**: ✅ **COMPLETED** in v0.3.0

**What was implemented**:
- ✅ Full Prisma 7.0.0 compatibility testing
- ✅ Updated to Prisma 7 Rust-free client architecture
- ✅ Schema updates (provider: `"prisma-client"`, removed datasource URL)
- ✅ Updated `prisma.config.ts` for Prisma 7
- ✅ All 77 tests passing with Prisma 7.0.0

**Result**: ~90% smaller bundles, up to 3x faster queries!

---

#### 2. Naming Convention Standardization ✅ DONE
**Status**: ✅ **COMPLETED** in v0.3.0 (BREAKING CHANGE)

**What was changed**:
- ✅ Renamed `PrismaBunSQLite` → `PrismaBunSqlite` (lowercase "sqlite")
- ✅ Renamed `PrismaBunSQLiteConfig` → `PrismaBunSqliteConfig`
- ✅ Renamed `PrismaBunSQLiteOptions` → `PrismaBunSqliteOptions`
- ✅ Updated all files (source, tests, examples, docs)
- ✅ Matches Prisma 7 standard: `PrismaBetterSqlite3`, `PrismaLibSql`

**Result**: Consistent with official Prisma 7 adapters!

---

#### 3. Dependency Updates ✅ DONE
**Status**: ✅ **COMPLETED** in v0.3.0

**What was updated**:
- ✅ peerDependencies: `@prisma/client >= 7.0.0`
- ✅ devDependencies: `@prisma/client ^7.0.0`, `prisma ^7.0.0`
- ✅ dependencies: `@prisma/driver-adapter-utils ^7.0.0`
- ✅ Version bumped to `0.3.0`

**Result**: Prisma 7 only (cleaner dependency tree)!

---

#### 4. Migration Architecture Documentation ✅ DONE
**Status**: ✅ **COMPLETED** in v0.3.0

**What was documented**:
- ✅ Added "Migrations in Prisma 7" section to README.md
- ✅ Documented CLI vs Runtime separation
- ✅ Explained Rust engine (CLI) vs Adapter (runtime)
- ✅ Updated CLAUDE.md with Prisma 7 architecture
- ✅ Comprehensive migration guide in CHANGELOG.md

**Result**: Crystal clear documentation on Prisma 7 migration architecture!

---

### Summary

**v0.3.0 is COMPLETE and ready to publish!** 🎉

All planned items delivered:
- ✅ Prisma 7.0.0 full support
- ✅ Naming convention standardized
- ✅ Migration architecture documented
- ✅ All dependencies updated
- ✅ 77/77 tests passing
- ✅ Zero TypeScript errors
- ✅ Breaking changes properly documented

---

## Future Enhancements

### High Priority

#### 1. Add Debug Logging
**Why**: Parity with official adapters, easier troubleshooting in production

**Implementation**:
```typescript
import { Debug } from '@prisma/driver-adapter-utils'
const debug = Debug('prisma:driver-adapter:bunsqlite')

async queryRaw(query: SqlQuery) {
  const tag = '[js::queryRaw]'
  debug(`${tag} %O`, query)
  // ...
}
```

**Files to change**:
- `src/bunsqlite-adapter.ts`: Add debug calls to all methods
- Add environment variable docs: `DEBUG=prisma:driver-adapter:bunsqlite`

**Estimated effort**: 1-2 hours

---

#### 2. Remove Dead Code
**Why**: Cleaner codebase, smaller bundle size

**To remove**:
- `getColumnTypesForQuery()` method (lines 442-476) - never called
- Verify no other unused code

**Files to change**:
- `src/bunsqlite-adapter.ts`

**Estimated effort**: 30 minutes

---

#### 3. Document/Remove Base64 BLOB Handling
**Why**: May be unnecessary code

**Investigation needed**:
```typescript
// Lines 154-165: Does Bun actually return BLOBs as base64?
if (typeof value === "string" && columnTypes[i] === ColumnTypeEnum.Bytes) {
  try {
    const buffer = Buffer.from(value, "base64");
    result[i] = Array.from(buffer);
    continue;
  } catch {
    // If not base64, treat as regular string
  }
}
```

**Action**:
1. Test if Bun ever returns BLOBs as base64 strings
2. If NO: Remove code (17 lines)
3. If YES: Add comment explaining when this happens

**Files to change**:
- `src/bunsqlite-adapter.ts`
- Add test if keeping the code

**Estimated effort**: 1 hour

---

### Medium Priority

#### 5. Refactor into Modular Files
**Why**: Better maintainability, easier to review changes

**Proposed structure**:
```
src/
├── index.ts              # Exports
├── adapter.ts            # Main adapter class (200 lines)
├── transaction.ts        # Transaction implementation (80 lines)
├── conversion.ts         # mapRow, mapArg, getColumnTypes (150 lines)
├── errors.ts             # Error mapping & codes (100 lines)
└── types.ts              # Type definitions (50 lines)
```

**Benefits**:
- Easier to find code
- Better separation of concerns
- Easier to test individual modules
- Smaller PR diffs

**Estimated effort**: 4-6 hours

---

#### 6. Add Comprehensive JSDoc Comments
**Why**: Better IDE autocomplete, clearer API

**Example**:
```typescript
/**
 * Creates a Prisma adapter for Bun's native SQLite.
 *
 * @param config - Configuration options
 * @param config.url - Database URL (file path or :memory:)
 * @param config.safeIntegers - Enable safe 64-bit integers (default: true)
 * @param config.timestampFormat - Timestamp storage format (default: "iso8601")
 *
 * @example
 * ```typescript
 * const adapter = new PrismaBunSqlite({ url: "file:./dev.db" });
 * const prisma = new PrismaClient({ adapter });
 * ```
 *
 * @see https://github.com/mmvsk/prisma-adapter-bunsqlite
 */
```

**Files to update**:
- All public classes and methods
- Configuration types

**Estimated effort**: 2-3 hours

---

### Low Priority

#### 7. Add TypeScript Strict Mode Lint
**Why**: Catch type regressions early

**Implementation**:
```json
// package.json
{
  "scripts": {
    "lint": "tsc --noEmit",
    "lint:strict": "tsc --noEmit --strict"
  }
}
```

Add to CI pipeline.

**Estimated effort**: 1 hour

---

#### 8. Improve Column Metadata Safety
**Why**: Reduce dependency on undocumented Bun API

**Current**:
```typescript
const columnNames = (stmt as any).columnNames || [];
const declaredTypes = (stmt as any).declaredTypes || [];
```

**Improvements**:
1. Add runtime check for property existence:
```typescript
const hasMetadata = 'columnNames' in stmt && 'declaredTypes' in stmt;
if (!hasMetadata) {
  // Fallback to PRAGMA or other method
  console.warn('[bunsqlite] Statement metadata unavailable');
}
```

2. File Bun issue: Request official API for `columnNames` and `declaredTypes`

**Estimated effort**: 2 hours + upstream discussion

---

## v0.3.0 - Performance & Optimization

### Performance Improvements

#### 9. Consider `usePhantomQuery: false`
**Why**: Fewer queries, better performance

**Caveat**: Requires complete transaction rewrite

**Investigation needed**:
1. Benchmark current performance with `usePhantomQuery: true`
2. Prototype with `usePhantomQuery: false`
3. Measure performance difference
4. Decide if benefit justifies refactor

**Changes required**:
- Set `usePhantomQuery: false`
- Remove COMMIT/ROLLBACK from transaction methods
- Let Prisma handle transaction lifecycle
- Update tests
- Update documentation

**Estimated effort**: 6-8 hours + extensive testing

**Decision**: Needs performance data to justify

---

#### 10. Add Performance Benchmarks
**Why**: Quantify performance, track regressions

**Benchmarks to add**:
```typescript
// benchmark.ts
import { performance } from 'perf_hooks'

const benchmarks = {
  'Simple query': () => prisma.user.findMany(),
  'Complex join': () => prisma.user.findMany({ include: { posts: true } }),
  'Transaction': () => prisma.$transaction([...]),
  'Raw query': () => prisma.$queryRaw`SELECT * FROM User`,
  'Bulk insert': () => prisma.user.createMany({ data: [...] }),
}

// Compare with libsql adapter
```

**Files to add**:
- `benchmark/simple.ts`
- `benchmark/complex.ts`
- `benchmark/comparison.ts`
- Add `bun run benchmark` script

**Estimated effort**: 4-6 hours

---

#### 11. Cache Schema Info (Optional)
**Why**: Reduce repeated PRAGMA calls

**Current**: Each query may hit `PRAGMA table_info()`

**Optimization**:
```typescript
class BunSqliteAdapter {
  private schemaCache = new Map<string, TableSchema>()

  private getTableSchema(tableName: string): TableSchema {
    if (!this.schemaCache.has(tableName)) {
      const schema = this.db.query(`PRAGMA table_info("${tableName}")`).all()
      this.schemaCache.set(tableName, schema)
    }
    return this.schemaCache.get(tableName)!
  }
}
```

**Consideration**: Cache invalidation on migrations

**Estimated effort**: 3-4 hours

---

## v1.0.0 - Production Hardening

### Before 1.0.0 Release

#### 12. Extensive Production Testing
**Requirements**:
- [ ] Used in production by 3+ projects for 3+ months
- [ ] No critical bugs reported
- [ ] Performance verified in real workloads
- [ ] All edge cases documented

---

#### 13. Full API Stability
**Requirements**:
- [ ] No breaking changes planned
- [ ] All deprecations removed
- [ ] API locked for semantic versioning

---

#### 14. Comprehensive Documentation
**Docs to complete**:
- [ ] Migration guides (from better-sqlite3, libsql)
- [ ] Troubleshooting guide
- [ ] Performance tuning guide
- [ ] FAQ section
- [ ] Video tutorial (optional)

---

## Future Considerations

### Features Under Consideration

#### 15. Configurable PRAGMA Settings
**Why**: Give users control over SQLite behavior

**Proposal**:
```typescript
new PrismaBunSqlite({
  url: "file:./dev.db",
  pragmas: {
    foreignKeys: true,      // default: true
    busyTimeout: 5000,      // default: 5000
    journalMode: "WAL",     // default: WAL
    synchronous: "NORMAL",  // new option
    cacheSize: -2000,       // new option
  }
})
```

**Decision**: Wait for user requests

---

#### 16. Connection Pooling
**Why**: Better performance under high concurrency

**Challenge**: SQLite is single-writer, pooling less beneficial

**Investigation**: Would read replicas help?

**Decision**: Wait for use case

---

#### 17. Encryption Support (SQLCipher)
**Why**: Encrypted database files

**Challenge**: Bun doesn't support SQLCipher natively

**Decision**: Wait for Bun support or user demand

---

## Completed Items

### v0.1.0
- ✅ Initial implementation
- ✅ Comprehensive test suite
- ✅ Documentation
- ✅ npm package setup

### v0.1.1
- ✅ Fix duplicate column data corruption
- ✅ Fix error mapping (errno support)
- ✅ Add LICENSE file
- ✅ Add regression tests

---

## Decision Log

### Decisions Made

1. **Keep `usePhantomQuery: true`** (v0.1.1)
   - Rationale: Current implementation correct, refactor not justified
   - Can reconsider with performance data

2. **Use `stmt.values()` over `stmt.all()`** (v0.1.1)
   - Rationale: Fixes data corruption with duplicate columns
   - No performance impact observed

3. **Support errno-based errors** (v0.1.1)
   - Rationale: Bun doesn't always set `.code`, need `.errno` fallback
   - Required for proper error handling

4. **Default `safeIntegers: true`** (v0.1.0)
   - Rationale: Prevent silent data corruption for large integers
   - Users can opt-out if needed

---

## Review Schedule

- **Monthly**: Review backlog priorities
- **Quarterly**: Re-assess roadmap based on user feedback
- **After major release**: Collect feedback, update backlog

---

## Contributing

Want to help? Pick an item from the backlog!

1. Comment on the issue (create one if needed)
2. Fork the repo
3. Make changes with tests
4. Submit PR referencing the backlog item

See [ARCHITECTURE.md](../ARCHITECTURE.md) for implementation details.

---

## Questions?

- Issues: https://github.com/mmvsk/prisma-adapter-bunsqlite/issues
- Discussions: https://github.com/mmvsk/prisma-adapter-bunsqlite/discussions

---

**Last updated**: Post v0.1.1 release
**Next review**: After first production deployments
