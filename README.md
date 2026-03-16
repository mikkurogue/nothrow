# nothrow

Lightweight `Result`-based error handling for TypeScript, with strong tagged-error ergonomics for both sync and async flows.

## Why nothrow

- Model failures as data (`Err`) instead of exceptions.
- Compose operations with `map`, `andThen`, `catchTag`, and `catchTags`.
- Use one mental model for sync and async code.
- Keep error handling explicit and type-driven.

## Install

```bash
pnpm add @nothrow
```

## ESM-only

`@nothrow` is published as **ESM-only**.

- Use `import`/`export` syntax.
- For Node.js projects, set `"type": "module"` in your `package.json`.
- CommonJS (`require`) is not supported.

If you are in a CommonJS codebase, you can still consume `@nothrow` via dynamic import:

```js
const { Result } = await import('@nothrow');
```

## Quick Start

```ts
import { Result, err, ok } from '@nothrow';

const parsePort = (input: string) =>
  Result.try(() => {
    const value = Number(input);
    if (!Number.isInteger(value) || value <= 0) {
      return err({ _tag: 'InvalidPort', input });
    }
    return ok(value);
  });

const out = parsePort('3000')
  .map((port) => port + 1)
  .catchTag('InvalidPort', () => ok(8080))
  .run();

console.log(out); // 3001
```

## API Overview

Top-level helpers:

- `ok`, `err`, `isOk`, `isErr`
- `map`, `mapErr`, `andThen`, `match`, `unwrapOr`
- `fromThrowable`
- `hasTag`, `hasTags`
- `taggedError`, `TaggedError`
- `try`, `tryAsync`

Chain APIs:

- `SyncResultChain`: `map`, `mapErr`, `andThen`, `catchAll`, `catchTag`, `catchTags`, `tapTag`, `toResult`, `run`, `unwrapOr`, `match`
- `AsyncResultChain`: `map`, `mapErr`, `andThen`, `catchAll`, `catchTag`, `catchTags`, `tapTag`, `toPromise`, `run`, `unwrapOr`, `match`

## Tagged Errors

Prefer `TaggedError`/`taggedError` for application and library boundaries.

- They are real `Error` instances and work with logging/tracing tools.
- They carry typed `_tag` discriminants for `catchTag`/`catchTags` flows.
- They can extend your own domain error classes when needed.

Plain object errors are also supported and remain useful for lightweight internal pipelines.

```ts
import { Result } from '@nothrow';

const NotFound = Result.taggedError('NotFound')<{ id: string }>();

const loadUser = (id: string) =>
  Result.try(() => {
    if (id === '0') {
      return Result.err(new NotFound({ id, message: 'User not found' }));
    }
    return Result.ok({ id, name: 'Ada' });
  });

const user = loadUser('0')
  .catchTag('NotFound', (e) => Result.ok({ id: e.id, name: 'Guest' }))
  .run();
```

## Generator style (`yield*`)

`Result.try` and `Result.tryAsync` support generator-based composition. This gives you early-exit behavior with linear, imperative-looking code.

```ts
import { Result, err, ok } from '@nothrow';

const readPort = (value: string) =>
  Result.try(() => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return err({ _tag: 'InvalidPort', value });
    }
    return ok(parsed);
  });

const normalizePort = (raw: string) =>
  Result.try(function* () {
    const port = yield* readPort(raw);
    if (port < 1 || port > 65535) {
      return err({ _tag: 'PortOutOfRange', port });
    }
    return ok(port);
  });
```

Async generators can mix sync and async chains in the same flow:

```ts
import { Result, ok } from '@nothrow';

const loadConfig = () => Result.tryAsync(async () => ok({ retry: 2 }));
const readEnv = () => Result.try(() => ok('prod'));

const buildRuntime = Result.tryAsync(function* () {
  const config = yield* loadConfig();
  const env = yield* readEnv();
  return ok({ env, retry: config.retry });
});
```

Generator gotchas:

- Use `yield*` with `Result.try(...)` / `Result.tryAsync(...)` chains. Plain `yield` is not the intended API.
- In `Result.try` (sync), yielding async values throws a `TypeError` by design.
- In `Result.tryAsync`, both sync and async chains are supported.
- Throwing inside the generator is captured and converted to `Err`.

## Development

This repo uses Vite+ (`vp`) for local tooling.

```bash
vp install
vp test
vp check
vp run build
```

## Safety Notes

- `SyncResultChain.run()` and `SyncResultChain.value` are intended for chains where the error type is `never`.
- That guarantee is type-level: if you force-cast types, runtime failures are still possible.
- Prefer `match`, `unwrapOr`, or `toResult`/`toPromise` when you are not fully eliminating errors.

## API Stability

- Current API is pre-1.0 (`0.x`), so minor versions may include breaking changes.
- Core constructors and chain combinators are intended to remain stable as the library matures.

## Cookbook

Recipe-driven examples live in `docs/cookbook.md`.
