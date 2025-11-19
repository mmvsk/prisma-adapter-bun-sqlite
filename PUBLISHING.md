# Publishing Guide

## Overview

This package is published to npm under the scoped name `prisma-adapter-bunsqlite`.

**Package Structure**:
- ESM only (no CommonJS)
- TypeScript declarations included
- Bun runtime required
- Zero dependencies (only `@prisma/driver-adapter-utils`)

## Prerequisites

1. **npm Account**: Create account at https://www.npmjs.com
2. **npm CLI**: Already available via Bun
3. **npm Login**: Run `npm login` to authenticate

```bash
npm login
# Enter your npm credentials
```

## Publishing Workflow

### 1. Pre-Publish Checklist

Before publishing, ensure:

- [ ] All tests pass: `bun test`
- [ ] Build succeeds: `bun run build`
- [ ] Version number is correct in `package.json`
- [ ] `CHANGELOG.md` is updated (if you have one)
- [ ] README examples are accurate
- [ ] Git is clean or changes are committed

### 2. Version Management

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features (backwards compatible)
- **PATCH** (0.0.1): Bug fixes (backwards compatible)

**Bump version using npm**:

```bash
# Patch release (0.1.0 -> 0.1.1)
npm version patch

# Minor release (0.1.0 -> 0.2.0)
npm version minor

# Major release (0.1.0 -> 1.0.0)
npm version major

# Pre-release (0.1.0 -> 0.1.1-beta.0)
npm version prepatch --preid=beta
```

This automatically:
- Updates `package.json` version
- Creates a git commit
- Creates a git tag

### 3. Publish to npm

**For first-time publish** (scoped package):

```bash
npm publish --access public
```

**For subsequent publishes**:

```bash
npm publish
```

**Test before publishing** (dry run):

```bash
npm publish --dry-run
```

This shows what files will be included without actually publishing.

### 4. Post-Publish

After publishing:

1. **Push git tags**:
   ```bash
   git push && git push --tags
   ```

2. **Create GitHub Release**:
   - Go to https://github.com/mmvsk/prisma-adapter-bunsqlite/releases
   - Click "Draft a new release"
   - Select the tag created by `npm version`
   - Add release notes

3. **Verify on npm**:
   - Visit https://www.npmjs.com/package/prisma-adapter-bunsqlite
   - Check version, files, and README

4. **Test installation**:
   ```bash
   mkdir test-install && cd test-install
   bun init -y
   bun add prisma-adapter-bunsqlite
   ```

## Automated Pre-Publish

The `prepublishOnly` script runs automatically before `npm publish`:

```json
"prepublishOnly": "bun run build && bun test"
```

This ensures:
1. Fresh build is created
2. All tests pass

**If this fails, the publish is aborted.**

## Version Strategy

### Initial Release (0.1.0)

Start with `0.1.0` to indicate:
- Working, tested implementation
- API may still evolve
- Not yet battle-tested in production

### Moving to 1.0.0

Promote to `1.0.0` when:
- API is stable
- Used in production by multiple users
- No major bugs reported
- Comprehensive test coverage (✅ done)
- Documentation complete (✅ done)

### Version History Example

```
0.1.0 - Initial release
0.1.1 - Bug fix: BLOB handling edge case
0.2.0 - Feature: Add shadowDatabaseUrl option
0.2.1 - Bug fix: Transaction rollback
1.0.0 - Stable release, API locked
1.1.0 - Feature: Connection pooling options
1.1.1 - Bug fix: DateTime timezone handling
2.0.0 - Breaking: New config format
```

## What Gets Published?

Only files listed in `package.json` `files` field:

```json
"files": [
  "dist",
  "README.md",
  "LICENSE"
]
```

**NOT included** (via `.npmignore` or not in `files`):
- `src/` (TypeScript source)
- `tests/`
- `prisma/`
- `.env`
- `node_modules/`
- Git files
- `CLAUDE.md`, `ARCHITECTURE.md`

## npm Package Structure

After publishing, users will get:

```
prisma-adapter-bunsqlite/
├── dist/
│   ├── index.js           # ESM JavaScript
│   ├── index.d.ts         # TypeScript types
│   ├── index.d.ts.map     # Source map for types
│   ├── bunsqlite-adapter.d.ts
│   └── bunsqlite-adapter.d.ts.map
├── README.md
├── LICENSE
└── package.json
```

## Unpublishing

**⚠️ Warning**: Unpublishing is discouraged and has restrictions.

**Within 72 hours**:
```bash
npm unpublish prisma-adapter-bunsqlite@0.1.0
```

**After 72 hours**: Cannot unpublish if package has downloads.

**Better alternative**: Deprecate instead:
```bash
npm deprecate prisma-adapter-bunsqlite@0.1.0 "Use version 0.2.0 instead"
```

## Troubleshooting

### "You do not have permission to publish"

**Cause**: Package name already taken or scoped package not public.

**Fix**:
```bash
npm publish --access public
```

### "Version already exists"

**Cause**: Trying to publish same version twice.

**Fix**: Bump version:
```bash
npm version patch
npm publish
```

### "Build failed" during publish

**Cause**: The `prepublishOnly` script failed.

**Fix**:
1. Run `bun run build` locally
2. Fix any TypeScript errors
3. Run `bun test` to ensure tests pass
4. Try publishing again

### "Package size too large"

**Cause**: Accidentally including large files.

**Fix**:
1. Check with `npm publish --dry-run`
2. Update `.npmignore` or `files` in `package.json`
3. Ensure `node_modules`, `tests`, `.git` are excluded

## Beta/Alpha Releases

For pre-release versions:

```bash
# Alpha release
npm version prerelease --preid=alpha
npm publish --tag alpha

# Beta release
npm version prerelease --preid=beta
npm publish --tag beta
```

Install with:
```bash
bun add prisma-adapter-bunsqlite@alpha
bun add prisma-adapter-bunsqlite@beta
```

## Recommended Workflow

**For each release**:

```bash
# 1. Ensure clean state
git status

# 2. Run tests
bun test

# 3. Update version
npm version patch  # or minor/major

# 4. Publish
npm publish

# 5. Push to GitHub
git push && git push --tags

# 6. Create GitHub release
# Visit GitHub and create release from tag
```

## Questions?

- **npm docs**: https://docs.npmjs.com/
- **Semantic Versioning**: https://semver.org/
- **Package publishing**: https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry

## Quick Reference

```bash
# Login
npm login

# Check login
npm whoami

# Dry run (see what will be published)
npm publish --dry-run

# Bump version + publish
npm version patch
npm publish

# Push to git
git push && git push --tags

# Deprecate old version
npm deprecate prisma-adapter-bunsqlite@0.1.0 "Upgrade to 0.2.0"

# View package info
npm info prisma-adapter-bunsqlite

# View all versions
npm info prisma-adapter-bunsqlite versions
```
