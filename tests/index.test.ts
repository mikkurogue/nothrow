import { describe, expect, test } from 'vite-plus/test';
import type { Err } from '../src';
import { Result, TaggedError, err, ok } from '../src';

class DbError extends TaggedError<'DbError'> {
  readonly query: string;

  constructor(query: string) {
    super('DbError', { query, message: 'db failed' });
    this.query = query;
  }
}

describe('Result basics', () => {
  test('ok/err constructors', () => {
    const a = ok(42);
    const b = err('boom');

    expect(Result.isOk(a)).toBe(true);
    expect(Result.isErr(a)).toBe(false);
    expect(Result.isOk(b)).toBe(false);
    expect(Result.isErr(b)).toBe(true);
  });

  test('map and andThen', () => {
    const value = Result.try(() => ok(2))
      .map((n) => n + 1)
      .andThen((n) => ok(n * 4))
      .unwrapOr(0);
    expect(value).toBe(12);
  });

  test('catchTag and catchAll on sync chain', () => {
    const recovered = Result.try(() => err(new DbError('SELECT *')))
      .catchTag('DbError', (e) => ok(e.query.length))
      .unwrapOr(0);
    expect(recovered).toBe(8);

    const recoveredAll = Result.try(() => err('bad'))
      .catchAll(() => ok(100))
      .unwrapOr(0);
    expect(recoveredAll).toBe(100);
  });

  test('sync catchTags returns a chain, .run() extracts the value', () => {
    const value = Result.try(() => err(new DbError('SELECT *')))
      .catchTags({
        DbError: (e) => ok(e.query.length),
      })
      .run();

    expect(value).toBe(8);
  });

  test('run throws with helpful message when Err reaches runtime', () => {
    const unsafe = Result.try(() => err(new DbError('SELECT *'))) as any;
    expect(() => unsafe.run()).toThrow('SyncResultChain.run() was called on an Err result.');
  });

  test('value getter throws with helpful message when Err reaches runtime', () => {
    const unsafe = Result.try(() => err(new DbError('SELECT *'))) as any;
    expect(() => unsafe.value).toThrow('SyncResultChain.value was called on an Err result.');
  });

  test('tapTag passes through and can observe errors', () => {
    let seen = '';
    const result = Result.try(() => err(new DbError('DELETE')))
      .tapTag('DbError', (e) => {
        seen = e.query;
      })
      .toResult();

    expect(seen).toBe('DELETE');
    expect(Result.isErr(result)).toBe(true);
  });

  test('tapTag ignores effect failures and preserves original error', () => {
    const result = Result.try(() => err(new DbError('UPDATE')))
      .tapTag('DbError', () => {
        throw new Error('side-effect failed');
      })
      .toResult();

    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error).toBeInstanceOf(DbError);
      expect(result.error.query).toBe('UPDATE');
    }
  });

  test('sync try wraps async value misuse as error', () => {
    const result = Result.try(() => Promise.resolve(ok(1)) as any).toResult();
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error).toBeInstanceOf(TypeError);
    }
  });

  test('catchTags handles direct values and chains from handlers', () => {
    const directValue = Result.try(() => err(new DbError('INSERT')))
      .catchTags({
        DbError: (e) => e.query.length,
      })
      .unwrapOr(0);
    expect(directValue).toBe(6);

    const chainedValue = Result.try(() => err(new DbError('UPSERT')))
      .catchTags({
        DbError: (e) => Result.try(() => ok(e.query.length + 1)),
      })
      .unwrapOr(0);
    expect(chainedValue).toBe(7);
  });

  test('fromThrowable maps thrown errors with custom mapper', () => {
    const parse = Result.fromThrowable(
      () => {
        throw new Error('bad parse');
      },
      (caught) => new DbError(`mapper:${(caught as Error).message}`),
    );

    const out = parse();
    expect(Result.isErr(out)).toBe(true);
    if (Result.isErr(out)) {
      expect(out.error).toBeInstanceOf(DbError);
      expect(out.error.query).toBe('mapper:bad parse');
    }
  });

  test('try generator short-circuits on first err', () => {
    const output = Result.try(function* (): Generator<unknown, number, any> {
      const one = yield* Result.try(() => ok(1));
      yield* Result.try(() => err('fail-here'));
      return one + 99;
    }).toResult();

    expect(Result.isErr(output)).toBe(true);
    if (Result.isErr(output)) {
      expect(output.error).toBe('fail-here');
    }
  });

  test('try generator wraps thrown values as err', () => {
    const output = Result.try(function* (): Generator<unknown, number, any> {
      yield* Result.try(() => ok(1));
      throw new Error('generator-failed');
    }).toResult();

    expect(Result.isErr(output)).toBe(true);
    if (Result.isErr(output)) {
      expect(output.error).toBeInstanceOf(Error);
      expect((output.error as Error).message).toBe('generator-failed');
    }
  });
});

describe('AsyncResult chain via Result.tryAsync', () => {
  test('async catchTags handles NotFound path', async () => {
    const NotFound = Result.taggedError('NotFound')<{ id: string }>();
    const ValidationError = Result.taggedError('ValidationError')<{ field: string }>();
    type AppError = InstanceType<typeof NotFound> | InstanceType<typeof ValidationError>;

    const value = await Result.tryAsync(async (): Promise<Err<AppError>> => {
      return err(new NotFound({ id: '42' }));
    })
      .catchTags({
        NotFound: (e) => ok(e.id.length),
        ValidationError: (e) => ok(e.field.length),
      })
      .run();

    expect(value).toBe(2);
  });

  test('async catchTags handles ValidationError path', async () => {
    const NotFound = Result.taggedError('NotFound')<{ id: string }>();
    const ValidationError = Result.taggedError('ValidationError')<{ field: string }>();
    type AppError = InstanceType<typeof NotFound> | InstanceType<typeof ValidationError>;

    const value = await Result.tryAsync(async (): Promise<Err<AppError>> => {
      return err(new ValidationError({ field: 'email' }));
    })
      .catchTags({
        NotFound: (e) => ok(e.id.length),
        ValidationError: (e) => ok(e.field.length),
      })
      .run();

    expect(value).toBe(5);
  });

  test('async generator works with yield*', async () => {
    const value = await Result.tryAsync(function* () {
      const one = yield* Result.try(() => ok(2));
      const two = yield* Result.tryAsync(async () => ok(5));
      return one + two;
    }).unwrapOr(0);

    expect(value).toBe(7);
  });

  test('async run throws with helpful message when Err reaches runtime', async () => {
    const unsafe = Result.tryAsync(async () => err(new DbError('SELECT *'))) as any;
    await expect(unsafe.run()).rejects.toThrow(
      'AsyncResultChain.run() was called on an Err result.',
    );
  });

  test('async catchTags handles direct values and async chains from handlers', async () => {
    const directValue = await Result.tryAsync(async () => err(new DbError('PATCH')))
      .catchTags({
        DbError: (e) => e.query.length,
      })
      .unwrapOr(0);
    expect(directValue).toBe(5);

    const chainedValue = await Result.tryAsync(async () => err(new DbError('MERGE')))
      .catchTags({
        DbError: async (e) => Result.tryAsync(async () => ok(e.query.length + 2)),
      })
      .unwrapOr(0);
    expect(chainedValue).toBe(7);
  });
});
