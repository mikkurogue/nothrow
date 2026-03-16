import type {
  AsyncInput,
  InferAsyncError,
  InferAsyncSuccess,
  InferSyncError,
  InferSyncSuccess,
  ResultValue,
  SyncInput,
} from './types';
export type { Err, Ok, ResultValue } from './types';

import { AsyncResultChain, SyncResultChain, setResolvers } from './core/chains';
import { hasTag, hasTags, isGenerator, isPromiseLike, isResultValue } from './core/guards';
import { runAsyncGenerator, runSyncGenerator } from './core/generator';
import { err, isErr, isOk, mapErrResult, mapResult, ok } from './core/result';
import { taggedError, TaggedError } from './tagged-error';

function resolveSyncInput<T, E>(input: SyncInput<T, E>): ResultValue<T, E> {
  if (input instanceof SyncResultChain) {
    return input.toResult();
  }

  if (input instanceof AsyncResultChain || isPromiseLike(input)) {
    throw new TypeError('Received async value in sync context. Use Result.tryAsync.');
  }

  if (isResultValue<T, E>(input)) {
    return input;
  }

  return ok(input as T);
}

async function resolveAsyncInput<T, E>(
  input: AsyncInput<T, E> | Promise<AsyncInput<T, E>>,
): Promise<ResultValue<T, E>> {
  const awaited = await input;

  if (awaited instanceof AsyncResultChain) {
    return awaited.toPromise();
  }

  if (awaited instanceof SyncResultChain) {
    return awaited.toResult();
  }

  if (isResultValue<T, E>(awaited)) {
    return awaited;
  }

  return ok(awaited as T);
}

setResolvers(resolveSyncInput, resolveAsyncInput);

function andThenResult<T, E, U, F>(
  input: SyncInput<T, E>,
  fn: (value: T) => SyncInput<U, F>,
): ResultValue<U, E | F> {
  const value = resolveSyncInput(input);
  if (isErr(value)) {
    return value;
  }
  return resolveSyncInput(fn(value.value));
}

function mapSyncResult<T, E, U>(input: SyncInput<T, E>, fn: (value: T) => U): ResultValue<U, E> {
  return mapResult(resolveSyncInput(input), fn);
}

function mapErrSyncResult<T, E, F>(input: SyncInput<T, E>, fn: (error: E) => F): ResultValue<T, F> {
  return mapErrResult(resolveSyncInput(input), fn);
}

function matchResult<T, E, A, B = A>(
  input: SyncInput<T, E>,
  onOk: (value: T) => A,
  onErr: (error: E) => B,
): A | B {
  const value = resolveSyncInput(input);
  return isOk(value) ? onOk(value.value) : onErr(value.error);
}

function unwrapOrResult<T, E>(input: SyncInput<T, E>, fallback: T): T {
  const value = resolveSyncInput(input);
  return isOk(value) ? value.value : fallback;
}

function fromThrowable<TArgs extends unknown[], TOut, E = unknown>(
  fn: (...args: TArgs) => TOut,
  onThrow?: (error: unknown) => E,
): (...args: TArgs) => ResultValue<TOut, E> {
  return function runFromThrowable(...args: TArgs): ResultValue<TOut, E> {
    try {
      return ok(fn(...args));
    } catch (caught) {
      if (onThrow) {
        return err(onThrow(caught));
      }
      return err(caught as E);
    }
  };
}

function trySync<TOutput>(
  fn: () => TOutput,
): SyncResultChain<InferSyncSuccess<TOutput>, InferSyncError<TOutput>> {
  type T = InferSyncSuccess<TOutput>;
  type E = InferSyncError<TOutput>;

  function runTrySync(): ResultValue<T, E> {
    try {
      const output = fn() as unknown;
      if (isGenerator(output)) {
        return runSyncGenerator<T, E>(
          output as Generator<unknown, T, ResultValue<unknown, unknown>>,
          resolveSyncInput,
        );
      }
      return resolveSyncInput(output as SyncInput<T, E>);
    } catch (caught) {
      return err(caught as E);
    }
  }

  return new SyncResultChain(runTrySync);
}

function tryAsync<TOutput>(
  fn: () => TOutput,
): AsyncResultChain<InferAsyncSuccess<TOutput>, InferAsyncError<TOutput>> {
  type T = InferAsyncSuccess<TOutput>;
  type E = InferAsyncError<TOutput>;

  async function runTryAsync(): Promise<ResultValue<T, E>> {
    try {
      const output = (await fn()) as unknown;
      if (isGenerator(output)) {
        return runAsyncGenerator<T, E>(
          output as Generator<unknown, T, ResultValue<unknown, unknown>>,
          resolveAsyncInput,
        );
      }
      return resolveAsyncInput(output as AsyncInput<T, E>);
    } catch (caught) {
      return err(caught as E);
    }
  }

  return new AsyncResultChain(runTryAsync);
}

export const Result = {
  ok,
  err,
  isOk,
  isErr,
  map: mapSyncResult,
  mapErr: mapErrSyncResult,
  andThen: andThenResult,
  match: matchResult,
  unwrapOr: unwrapOrResult,
  fromThrowable,
  hasTag,
  hasTags,
  taggedError,
  try: trySync,
  tryAsync,
  TaggedError,
};

export {
  AsyncResultChain,
  SyncResultChain,
  err,
  fromThrowable,
  hasTag,
  hasTags,
  isErr,
  isOk,
  mapErrResult as mapErr,
  mapResult as map,
  matchResult as match,
  ok,
  andThenResult as andThen,
  taggedError,
  tryAsync,
  trySync as try,
  TaggedError,
  unwrapOrResult as unwrapOr,
};

export type ResultNamespace = typeof Result;
export type {
  AsyncHandlers,
  AsyncInput,
  ExcludeByTag,
  ExcludeHandled,
  ExtractByTag,
  ExtractTag,
  InferAsyncError,
  InferAsyncSuccess,
  InferSyncError,
  InferSyncSuccess,
  SyncHandlers,
  SyncInput,
} from './types';
