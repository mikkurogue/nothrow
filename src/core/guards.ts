import type { AsyncInput, Err, ExtractByTag, ExtractTag, ResultValue, SyncInput } from '../types';

export function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return isObject(value) && typeof value.then === 'function';
}

export function isResultValue<T, E>(value: unknown): value is ResultValue<T, E> {
  if (!isObject(value)) {
    return false;
  }
  return (
    (value._tag === 'Ok' && Object.prototype.hasOwnProperty.call(value, 'value')) ||
    (value._tag === 'Err' && Object.prototype.hasOwnProperty.call(value, 'error'))
  );
}

export function isSyncInputChain<T, E>(
  value: unknown,
): value is Extract<SyncInput<T, E>, { toResult: unknown }> {
  return isObject(value) && typeof value.toResult === 'function';
}

export function isAsyncInputChain<T, E>(
  value: unknown,
): value is Extract<AsyncInput<T, E>, { toPromise: unknown }> {
  return isObject(value) && typeof value.toPromise === 'function';
}

export function isGenerator(value: unknown): value is Generator<unknown, unknown, unknown> {
  return isObject(value) && typeof value.next === 'function' && typeof value.throw === 'function';
}

export function hasTag<TValue extends { _tag: string }, TTag extends string>(
  value: TValue,
  tag: TTag,
): value is Extract<TValue, { _tag: TTag }>;
export function hasTag<TTag extends string>(value: unknown, tag: TTag): value is { _tag: TTag };
export function hasTag(value: unknown, tag: string): value is { _tag: string } {
  return isObject(value) && value._tag === tag;
}

export function hasTags<TValue extends { _tag: string }, TTag extends string>(
  value: TValue,
  tags: readonly TTag[],
): value is Extract<TValue, { _tag: TTag }>;
export function hasTags<TTag extends string>(
  value: unknown,
  tags: readonly TTag[],
): value is { _tag: TTag };
export function hasTags(value: unknown, tags: readonly string[]): value is { _tag: string } {
  return isObject(value) && typeof value._tag === 'string' && tags.includes(value._tag);
}

export function hasErrorTagIn<E, TTag extends ExtractTag<E>>(
  value: E,
  tag: TTag,
): value is ExtractByTag<E, TTag> {
  return hasTag(value, tag);
}

export function isErr<T, E>(value: ResultValue<T, E>): value is Err<E> {
  return value._tag === 'Err';
}
