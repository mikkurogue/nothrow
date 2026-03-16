# Contributing

Thanks for contributing to `nothrow`.

## Prerequisites

- Node.js 20+
- Vite+ CLI (`vp`)

## Setup

```bash
vp install
```

## Development workflow

```bash
vp test
vp check
vp run build
```

## Guidelines

- Keep changes focused and small.
- Add tests for behavior changes.
- Preserve ESM-only package support.
- Prefer explicit tagged errors for public examples and docs.

## Pull requests

- Include a clear summary of why the change exists.
- Mention user-facing API changes in the PR description.
- Update `CHANGELOG.md` for notable changes.
