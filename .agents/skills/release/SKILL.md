---
name: release
description: Publish a new npm release via GitHub Release. Use when the user wants to ship a new version.
---

## Release Checklist

### 1. Quality gate

```bash
gh run list --branch main --workflow=e2e.yml --limit 1
```

If the latest E2E run on main is not `success`, stop and tell the user.

### 2. Check for changes

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

If there are no new commits since the last tag, stop and tell the user there's nothing to release.

### 3. Gather changelog

Group the commits above into Features, Fixes, Improvements, Docs, etc. Show the categorized changelog to the user.

### 4. Bump version

```bash
npm version <version>
```

This updates package.json, commits, and tags in one step. Confirm the version with the user first.

### 5. Push

```bash
git push origin main --tags
```

### 6. Create GitHub Release

Always create with a proper changelog — never a bare "Release vX.Y.Z":

```bash
gh release create <tag> --title "<version>" --notes "<changelog>"
```

For pre-releases or when the user wants to review first, add `--prerelease` or `--draft`.

## Notes

- The publish workflow triggers on `release: [published]`, so the Release must be published (not left as draft) for npm to pick it up.
- Wait for CI to finish, then confirm with `npm view <package> version`.
