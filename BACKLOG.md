# Backlog

Future improvements and enhancements for `prisma-adapter-bun-sqlite`.

## v1.0.0 - Production Hardening

Before declaring 1.0.0:

- [ ] Used in production by 3+ projects for 3+ months
- [ ] No critical bugs reported
- [ ] Performance verified in real workloads
- [ ] Troubleshooting guide written
- [ ] FAQ section added

## Future Considerations

### Encryption Support (SQLCipher)

**Why**: Encrypted database files
**Challenge**: Bun doesn't support SQLCipher natively
**Decision**: Wait for Bun support or user demand

## Decision Log

Key design decisions (see ARCHITECTURE.md for details):

1. **`usePhantomQuery: false`** - Match official better-sqlite3 adapter
2. **`stmt.values()` over `stmt.all()`** - Prevent data corruption with duplicate columns
3. **`safeIntegers: true` by default** - Prevent silent precision loss
4. **`foreign_keys=ON` by default** - Prisma relations need FK constraints
5. **`busy_timeout=5000` by default** - Prevent immediate lock errors
6. **ISO8601 timestamps** - Human-readable, SQLite function compatible
7. **`BEGIN` not `BEGIN IMMEDIATE`** - Our mutex serializes already
8. **Custom AsyncMutex** - Zero dependencies, 35 lines
9. **Always coerce argument types** - Correctness over micro-optimization

---

**Last updated**: v0.5.0
