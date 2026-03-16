import type { Err, Ok, ResultValue } from '../types';

import { isErr } from './guards';

export function ok<T>(value: T): Ok<T> {
  return {
    _tag: 'Ok',
    value,
  };
}

export function err<E>(error: E): Err<E> {
  return {
    _tag: 'Err',
    error,
  };
}

export function isOk<T, E>(value: ResultValue<T, E>): value is Ok<T> {
  return value._tag === 'Ok';
}

export { isErr };

export function unwrapOkOrThrow<T, E>(result: ResultValue<T, E>, context: string): T {
  if (isErr(result)) {
    throw new Error(
      `${context} was called on an Err result. Handle errors with catchTag/catchTags/catchAll/match/unwrapOr first.`,
      { cause: result.error },
    );
  }
  return result.value;
}

export function mapResult<T, E, U>(
  input: ResultValue<T, E>,
  fn: (value: T) => U,
): ResultValue<U, E> {
  if (isErr(input)) {
    return input;
  }
  return ok(fn(input.value));
}

export function mapErrResult<T, E, F>(
  input: ResultValue<T, E>,
  fn: (error: E) => F,
): ResultValue<T, F> {
  if (isOk(input)) {
    return input;
  }
  return err(fn(input.error));
}
