import { describe, expectTypeOf, test } from 'vite-plus/test';
import type { Err } from '../src';
import { Result, err, ok } from '../src';

const NotFound = Result.taggedError('NotFound')<{ id: string }>();
const ValidationError = Result.taggedError('ValidationError')<{ field: string }>();
const Unauthorized = Result.taggedError('Unauthorized')<{ role: string }>();

type AppError =
  | InstanceType<typeof NotFound>
  | InstanceType<typeof ValidationError>
  | InstanceType<typeof Unauthorized>;

describe('Type inference', () => {
  test('catchTag removes handled tag from error union', () => {
    const chain = Result.try((): Err<AppError> => {
      return err<AppError>(new NotFound({ id: '42' }));
    }).catchTag('NotFound', (e) => ok(e.id.length));

    const value = chain.unwrapOr(0);
    expectTypeOf(value).toEqualTypeOf<number>();

    // @ts-expect-error NotFound is already handled by catchTag above.
    chain.catchTag('NotFound', (e) => ok(e.id.length));
  });

  test('catchTags can fully recover to never error', () => {
    const chain = Result.try((): Err<AppError> => {
      return err<AppError>(new ValidationError({ field: 'email' }));
    }).catchTags({
      NotFound: (e) => ok(e.id.length),
      ValidationError: (e) => ok(e.field.length),
      Unauthorized: (e) => ok(e.role.length),
    });

    const value = chain.run();
    expectTypeOf(value).toEqualTypeOf<number>();
  });

  test('hasTag narrows from unknown and from unions', () => {
    const unknownValue: unknown = { _tag: 'Unauthorized', role: 'admin' };

    if (Result.hasTag(unknownValue, 'Unauthorized')) {
      expectTypeOf(unknownValue._tag).toEqualTypeOf<'Unauthorized'>();
    }

    const unionValue:
      | { _tag: 'NotFound'; id: string }
      | { _tag: 'ValidationError'; field: string } =
      Math.random() > 0.5 ? { _tag: 'NotFound', id: '1' } : { _tag: 'ValidationError', field: 'f' };

    if (Result.hasTag(unionValue, 'NotFound')) {
      expectTypeOf(unionValue.id).toEqualTypeOf<string>();
    }
  });

  test('tryAsync inference keeps value types through catchTags', async () => {
    const result = await Result.tryAsync(async () => {
      return err<AppError>(new Unauthorized({ role: 'reader' }));
    })
      .catchTags({
        Unauthorized: (e) => ok(e.role.length),
      })
      .toPromise();

    if (Result.isOk(result)) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(result.error).toMatchTypeOf<
        InstanceType<typeof NotFound> | InstanceType<typeof ValidationError>
      >();
    }
  });

  test('andThen infers value transitions', () => {
    const value = Result.try(() => ok(2))
      .andThen((n) => ok(n.toString()))
      .andThen((text) => ok(text.length))
      .unwrapOr(0);

    expectTypeOf(value).toEqualTypeOf<number>();
  });
});
