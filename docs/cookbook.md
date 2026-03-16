# Cookbook

Practical examples for building robust error flows with `@mikkurogue/nothrow`.

## Choosing an error shape

- Prefer `TaggedError` for boundaries (HTTP handlers, DB layers, background jobs, public APIs).
- Use object errors for compact, local validation flows where extending `Error` is unnecessary.
- Mix both styles when useful: normalize foreign errors to `TaggedError` at boundaries, keep internal stages lightweight.

## API client with typed recoveries

```ts
import { Result } from '@mikkurogue/nothrow';

const NetworkError = Result.taggedError('NetworkError')<{ url: string }>();
const HttpError = Result.taggedError('HttpError')<{ status: number; url: string }>();

async function getJson(url: string) {
  return Result.tryAsync(async () => {
    const response = await fetch(url);
    if (!response.ok) {
      return Result.err(new HttpError({ status: response.status, url }));
    }
    return Result.ok(await response.json());
  }).catchAll((error) => {
    if (error instanceof HttpError) {
      return Result.err(error);
    }
    return Result.err(new NetworkError({ url, cause: error }));
  });
}

const data = await getJson('https://api.example.com/user/42')
  .catchTag('HttpError', (e) => {
    if (e.status === 404) return Result.ok({ id: '42', name: 'Guest' });
    return Result.err(e);
  })
  .unwrapOr({ id: '0', name: 'Fallback' });
```

## Database call wrapping

```ts
import { Result } from '@mikkurogue/nothrow';

const DbError = Result.taggedError('DbError')<{ query: string }>();

const queryOne = Result.fromThrowable(
  (query: string) => {
    // call driver here
    return { id: '1', email: 'dev@example.com' };
  },
  (error) => new DbError({ query: 'SELECT * FROM users LIMIT 1', cause: error }),
);

const user = Result.try(() => queryOne('SELECT * FROM users LIMIT 1'))
  .andThen((result) => result)
  .catchTag('DbError', () => Result.ok({ id: '0', email: 'fallback@example.com' }))
  .run();
```

## Validation pipeline

```ts
import { Result } from '@mikkurogue/nothrow';

type ValidationError =
  | { _tag: 'Required'; field: string }
  | { _tag: 'InvalidEmail'; value: string };

const validateEmail = (input: string) =>
  Result.try(() => {
    if (!input) return Result.err<ValidationError>({ _tag: 'Required', field: 'email' });
    if (!input.includes('@'))
      return Result.err<ValidationError>({ _tag: 'InvalidEmail', value: input });
    return Result.ok(input.toLowerCase());
  });

const normalized = validateEmail('USER@EXAMPLE.COM')
  .map((email) => email.trim())
  .run();
```

## Tag-based recovery with mixed errors

```ts
import { Result, err } from '@mikkurogue/nothrow';

const NotFound = Result.taggedError('NotFound')<{ id: string }>();
const PermissionDenied = Result.taggedError('PermissionDenied')<{ role: string }>();

type AppError = InstanceType<typeof NotFound> | InstanceType<typeof PermissionDenied>;

const readProfile = (id: string) =>
  Result.try((): ReturnType<typeof err<AppError>> => {
    if (id === 'missing') return err(new NotFound({ id }));
    if (id === 'restricted') return err(new PermissionDenied({ role: 'viewer' }));
    return Result.ok({ id, name: 'Ada' });
  });

const profile = readProfile('missing')
  .catchTags({
    NotFound: () => Result.ok({ id: 'guest', name: 'Guest' }),
    PermissionDenied: () => Result.ok({ id: 'anon', name: 'Anonymous' }),
  })
  .run();
```

## Generator-style orchestration with early exit

```ts
import { Result, err, ok } from '@mikkurogue/nothrow';

const parseLimit = (input: string) =>
  Result.try(() => {
    const value = Number(input);
    if (!Number.isInteger(value)) {
      return err({ _tag: 'InvalidLimit', input });
    }
    return ok(value);
  });

const parseOffset = (input: string) =>
  Result.try(() => {
    const value = Number(input);
    if (!Number.isInteger(value)) {
      return err({ _tag: 'InvalidOffset', input });
    }
    return ok(value);
  });

const parsePagination = (limitRaw: string, offsetRaw: string) =>
  Result.try(function* () {
    const limit = yield* parseLimit(limitRaw);
    const offset = yield* parseOffset(offsetRaw);

    if (limit <= 0) {
      return err({ _tag: 'InvalidLimit', input: String(limit) });
    }

    if (offset < 0) {
      return err({ _tag: 'InvalidOffset', input: String(offset) });
    }

    return ok({ limit, offset });
  });

const pagination = parsePagination('20', '0').unwrapOr({ limit: 10, offset: 0 });
```

## Async generator flow mixing sync and async

```ts
import { Result, err, ok } from '@mikkurogue/nothrow';

const fetchUser = (id: string) =>
  Result.tryAsync(async () => {
    if (id === '0') {
      return err({ _tag: 'NotFound', id });
    }
    return ok({ id, orgId: 'acme' });
  });

const readRegion = () => Result.try(() => ok('us-east-1'));

const buildContext = (userId: string) =>
  Result.tryAsync(function* () {
    const user = yield* fetchUser(userId);
    const region = yield* readRegion();
    return ok({ user, region });
  });

const context = await buildContext('42').unwrapOr({
  user: { id: 'guest', orgId: 'public' },
  region: 'local',
});
```

### Generator gotchas

- Always compose chains with `yield*`.
- `Result.try` is sync-only and rejects async yielded values.
- `Result.tryAsync` can consume both sync and async chain yields.
- Thrown errors inside generator bodies are safely wrapped as `Err`.
