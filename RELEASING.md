# Releasing

This package is versioned with SemVer and published as ESM-only.

## Release checklist

1. Ensure branch is up to date and CI is green.
2. Run local validation:

```bash
vp check
vp test
vp run build
```

3. Update `CHANGELOG.md` under the new version heading.
4. Bump version (example using `bumpp`):

```bash
vp exec bumpp --commit --tag
```

5. Publish from a clean state:

```bash
vp pm publish --access public
```

## Notes

- Do not introduce CommonJS output; keep ESM-only package surface.
- If export paths change, add tests that import from `dist/index.mjs`.
