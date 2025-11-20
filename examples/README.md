# Standalone Binary Examples

These examples demonstrate how to create **standalone Bun binaries** with embedded Prisma migrations using `prisma-adapter-bun-sqlite`.

## Why This Works

Unlike Node.js adapters (better-sqlite3, node-sqlite3), this adapter:

- ✅ **Zero native dependencies** - Uses Bun's built-in `bun:sqlite`
- ✅ **No node_modules required** - Pure Bun runtime
- ✅ **Single binary deployment** - Compile with `bun build --compile`
- ✅ **Embedded migrations** - Bundle SQL as strings or assets
- ✅ **Full Prisma ORM** - All features work in standalone mode

---

## Example 1: Embedded Migrations (Recommended)

**File**: [`standalone-binary.ts`](./standalone-binary.ts)

Migrations are hardcoded as strings in your code. Best for simple apps or when you want full control.

### Build:

```bash
bun build --compile ./examples/standalone-binary.ts --outfile myapp
```

### Run:

```bash
./myapp
```

### Result:

- Single binary (~50MB including Bun runtime)
- No node_modules needed
- Database created on first run
- Migrations applied automatically

### Pros:

- ✅ Simple and explicit
- ✅ No external files needed
- ✅ Easy to understand

### Cons:

- ⚠️ Migrations in code (harder to manage for complex schemas)
- ⚠️ Need to recompile for migration changes

---

## Example 2: Bundle Migration Files

**File**: [`bundle-with-migration-files.ts`](./bundle-with-migration-files.ts)

Reads migration SQL files from `prisma/migrations/` and embeds them at **build time**.

### Setup:

1. Generate Prisma migrations normally:

```bash
bunx prisma migrate dev --name init
```

This creates `prisma/migrations/TIMESTAMP_init/migration.sql`

2. Build the binary:

```bash
bun build --compile ./examples/bundle-with-migration-files.ts --outfile myapp
```

3. Run:

```bash
./myapp
```

### How it works:

- At **build time**: Reads all migration files from `prisma/migrations/`
- Embeds SQL as strings in the binary
- At **runtime**: Applies migrations using `executeScript()`
- Tracks applied migrations in `_prisma_migrations` table (Prisma-compatible)

### Pros:

- ✅ Use standard Prisma migration workflow (`prisma migrate dev`)
- ✅ Migration files stay separate during development
- ✅ Embedded in binary for deployment

### Cons:

- ⚠️ Requires rebuild for new migrations
- ⚠️ Migration files must exist at build time

---

## Deployment Strategies

### Strategy 1: Single Binary (No Migrations)

If your schema rarely changes:

```bash
# Build
bun build --compile src/index.ts --outfile myapp

# Deploy - single file!
scp myapp server:/opt/myapp/
ssh server '/opt/myapp/myapp'
```

### Strategy 2: Binary + External Migrations

If schema changes frequently:

```bash
# Build app
bun build --compile src/index.ts --outfile myapp

# Deploy
scp myapp server:/opt/myapp/
scp -r prisma/migrations server:/opt/myapp/

# Run migrations on server
ssh server 'cd /opt/myapp && bunx prisma migrate deploy'
```

### Strategy 3: Embedded Migrations (This Example)

Best of both worlds:

```bash
# Build with embedded migrations
bun build --compile examples/bundle-with-migration-files.ts --outfile myapp

# Deploy - single file, migrations included!
scp myapp server:/opt/myapp/
ssh server '/opt/myapp/myapp'  # Automatically runs migrations
```

---

## Comparison with Node.js Approaches

| Feature                    | better-sqlite3 (Node) | prisma-adapter-bun-sqlite (Bun) |
| -------------------------- | --------------------- | -------------------------------- |
| Native dependencies        | ✅ Yes (node-gyp)     | ❌ No (Bun built-in)             |
| Standalone binary possible | ⚠️ Difficult          | ✅ Easy                          |
| Binary size                | ~120MB + node_modules | ~50MB (Bun runtime only)         |
| Cross-compile              | ❌ No (native module) | ✅ Yes (pure Bun)                |
| Docker size                | ~200MB (Node + deps)  | ~90MB (Bun only)                 |
| Migration embedding        | ⚠️ Complex            | ✅ Simple (shown here)           |

---

## Advanced: Custom Migration Runner

You can also build a custom migration CLI:

```typescript
// migrate.ts
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

const adapter = await new PrismaBunSqlite({ url: "file:./data.db" }).connect();

const migrationSQL = await Bun.file("./migrations/001_init.sql").text();
await adapter.executeScript(migrationSQL);

console.log("✅ Migration applied");
```

Build it:

```bash
bun build --compile migrate.ts --outfile migrate
./migrate  # Run migrations
```

---

## Shadow Database Support (Available in v0.2.0+)

Full `prisma migrate dev` support with shadow database is now available!

**Features:**
- ✅ Full `prisma migrate dev` compatibility
- ✅ Shadow database defaults to `:memory:` for maximum speed
- ✅ Programmatic migration utilities (`runMigrations`, `createTestDatabase`)
- ✅ Works with `prisma.config.ts` and JS engine

**Configuration:**

```typescript
// prisma.config.ts
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "js",
  experimental: { adapter: true },
  adapter: async () => {
    return new PrismaBunSqlite({
      url: env("DATABASE_URL"),
      shadowDatabaseUrl: ":memory:",  // Fast shadow DB for migrations
    });
  },
});
```

**See also:**
- [CHANGELOG.md](../CHANGELOG.md) - v0.2.0 release notes
- [README.md](../README.md#migration-utilities-v020) - Migration utilities API

---

## Tips

### 1. Database Location

```typescript
// Relative to binary
const dbPath = new URL("./data.db", import.meta.url).pathname;

// From environment
const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "./data.db";

// Absolute path
const dbPath = "/var/lib/myapp/data.db";
```

### 2. Migration Tracking

The examples use `_prisma_migrations` table, compatible with Prisma's format:

```sql
CREATE TABLE _prisma_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  finished_at DATETIME,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Binary Size Optimization

```bash
# Strip debug symbols (reduces ~10MB)
bun build --compile --minify src/index.ts --outfile myapp

# Use UPX compression (reduces ~30MB, slower startup)
upx --best myapp
```

### 4. Error Handling

```typescript
try {
  await applyMigrations(adapter);
} catch (error) {
  console.error("Migration failed:", error);
  // Rollback logic here
  process.exit(1);
}
```

---

## Questions?

- **CHANGELOG**: [../CHANGELOG.md](../CHANGELOG.md) - Recent changes
- **BACKLOG**: [../BACKLOG.md](../BACKLOG.md) - Upcoming features
- **Architecture**: [../ARCHITECTURE.md](../ARCHITECTURE.md) - How it works
- **Issues**: https://github.com/mmvsk/prisma-adapter-bun-sqlite/issues
