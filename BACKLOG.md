# Backlog

Future improvements and enhancements for `prisma-adapter-bun-sqlite`.

## v1.0.0 - Production Hardening

Soak criteria:

- [ ] 0.9.x cycle with API freeze (no breaking changes)
- [ ] Used in production by 3+ projects for 3+ months
- [ ] No critical bugs reported
- [ ] Performance verified in real workloads

Nice-to-have (not blockers):

- [ ] Troubleshooting guide
- [ ] FAQ section

## Follow-ups (post-0.8)

Identified during the 0.8.0 upstream-parity sweep; not urgent, worth considering:

### Features

- [ ] **Pass-through raw `bun:sqlite` options** in factory config (`readonly`, `create`, `strict`). Enables read-replica setups. Matches what `@prisma/adapter-better-sqlite3` does for `better-sqlite3` options.
- [ ] **Consider deprecating `safeIntegers: false`** — it's a foot-gun for BIGINT precision. Upstream doesn't expose an off-switch.

### Test coverage gaps

- [ ] `AsyncMutex` queue-size-limit branch is untested — the `throw` at max queue depth never fires in the suite.
- [ ] `dispose()` while a transaction is still in flight — coverage exists as a code path (mutex acquire), no test exercises it under load.
- [ ] **Nested interactive transactions via Prisma** — we have a direct savepoint test on the adapter; no end-to-end test through `prisma.$transaction(async tx => tx.$transaction(...))`.
- [ ] **Adapter error-forwarding pattern** — port the idea from `prisma/client/tests/functional/driver-adapters/error-forwarding`: inject a deliberately broken adapter, assert errors bubble up unchanged for every hook (queryRaw/executeRaw/startTransaction/itx).
- [ ] **Concurrent upsert under WAL** — port `prisma/client/tests/functional/issues/22947-sqlite-conccurrent-upsert`. High-value since we have WAL config but no contention tests against it.
- [ ] **Invalid isolation level** — snapshot test for `prisma.$transaction([...], { isolationLevel: 'ReadUncommitted' })` asserting the `InvalidIsolationLevel` rejection message.

## Decision Log

Key design decisions (see ARCHITECTURE.md for details):

1. **`usePhantomQuery: false`** — Match official better-sqlite3 adapter
2. **`stmt.values()` over `stmt.all()`** — Prevent data corruption with duplicate columns
3. **`safeIntegers: true` by default** — Prevent silent precision loss
4. **`foreign_keys=ON` by default** — Prisma relations need FK constraints
5. **`busy_timeout=5000` by default** — Prevent immediate lock errors
6. **ISO8601 timestamps** — Human-readable, SQLite function compatible
7. **`BEGIN` not `BEGIN IMMEDIATE`** — Our mutex serializes already
8. **Custom AsyncMutex** — Zero dependencies; preferred over the `async-mutex` package used upstream
9. **Always coerce argument types** — Correctness over micro-optimization
10. **Double-release protection in mutex** — Defensive programming, no-op on second release
11. **Mutex queue size limit** — Prevent unbounded memory growth (default: 1000)
12. **Safe `dispose()`** — Wait for transaction completion before closing
13. **`UnknownNumber` for type inference** — Match official adapter behavior
14. **Bun 1.3.0+ minimum** — Simplified codebase with consistent metadata access pattern
15. **Savepoint support** — Implement optional Transaction methods via plain SAVEPOINT/ROLLBACK TO/RELEASE SAVEPOINT SQL; names are engine-controlled (matches official better-sqlite3 adapter)
16. **Idempotent commit/rollback** — Second call is a no-op; mutex releaser was already idempotent, state field is now consistent with it
17. **`getDatabase()` accessor** — Publicly exposed on `BunSqliteAdapter` for migration utilities; not part of the `SqlDriverAdapter` contract
18. **Rethrow unrecognized errors** — `driver-adapter-utils`' `wrapAsync` already registers them into its `errorRegistry` with full stack; wrapping into `GenericJs` ourselves was redundant and lossy. Reverses the v0.6.0 decision (matches official better-sqlite3 adapter)
19. **BLOB rows as `Uint8Array`** — Bun returns `Uint8Array` natively; pass through instead of down-converting to `number[]`. Matches canonical `ResultValue` shape
20. **`maxBindValues: 32766`** — Bun's SQLite is compiled with `MAX_VARIABLE_NUMBER=250000`; runtime default is SQLite 3.32+ standard of 32766 (was 999, throttling `IN` queries unnecessarily)

---

**Last updated**: v0.8.0
