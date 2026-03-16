# Cookbook

Practical examples for building robust error flows with `nothrow`.

## API client with typed recoveries

```ts
import { Result } from 'nothrow';

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
import { Result } from 'nothrow';

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
import { Result } from 'nothrow';

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
import { Result, err } from 'nothrow';

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
