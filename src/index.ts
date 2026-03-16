import type {
  AsyncHandlerError,
  AsyncHandlerValue,
  AsyncHandlers,
  AsyncInput,
  Err,
  ExcludeByTag,
  ExcludeHandled,
  ExtractByTag,
  ExtractTag,
  InferAsyncError,
  InferAsyncSuccess,
  InferSyncError,
  InferSyncSuccess,
  Ok,
  ResultValue,
  SyncHandlerError,
  SyncHandlerValue,
  SyncHandlers,
  SyncInput,
} from './types';
export type { Err, Ok, ResultValue } from './types';

const RESULT_YIELD = Symbol('nothrow.result.yield');

type YieldInstruction<T, E> = {
  [RESULT_YIELD]: true;
  run: () => ResultValue<T, E> | Promise<ResultValue<T, E>>;
};

function ok<T>(value: T): Ok<T> {
  return {
    _tag: 'Ok',
    value,
  };
}

function err<E>(error: E): Err<E> {
  return {
    _tag: 'Err',
    error,
  };
}

function isOk<T, E>(value: ResultValue<T, E>): value is Ok<T> {
  return value._tag === 'Ok';
}

function isErr<T, E>(value: ResultValue<T, E>): value is Err<E> {
  return value._tag === 'Err';
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return isObject(value) && typeof value.then === 'function';
}

function isResultValue<T, E>(value: unknown): value is ResultValue<T, E> {
  if (!isObject(value)) {
    return false;
  }
  return (
    (value._tag === 'Ok' && Object.prototype.hasOwnProperty.call(value, 'value')) ||
    (value._tag === 'Err' && Object.prototype.hasOwnProperty.call(value, 'error'))
  );
}

function isYieldInstruction<T, E>(value: unknown): value is YieldInstruction<T, E> {
  return isObject(value) && value[RESULT_YIELD] === true && typeof value.run === 'function';
}

function isGenerator(value: unknown): value is Generator<unknown, unknown, unknown> {
  return isObject(value) && typeof value.next === 'function' && typeof value.throw === 'function';
}

function hasTag<TValue extends { _tag: string }, TTag extends string>(
  value: TValue,
  tag: TTag,
): value is Extract<TValue, { _tag: TTag }>;
function hasTag<TTag extends string>(value: unknown, tag: TTag): value is { _tag: TTag };
function hasTag(value: unknown, tag: string): value is { _tag: string } {
  return isObject(value) && value._tag === tag;
}

function hasTags<TValue extends { _tag: string }, TTag extends string>(
  value: TValue,
  tags: readonly TTag[],
): value is Extract<TValue, { _tag: TTag }>;
function hasTags<TTag extends string>(
  value: unknown,
  tags: readonly TTag[],
): value is { _tag: TTag };
function hasTags(value: unknown, tags: readonly string[]): value is { _tag: string } {
  return isObject(value) && typeof value._tag === 'string' && tags.includes(value._tag);
}

function hasErrorTagIn<E, TTag extends ExtractTag<E>>(
  value: E,
  tag: TTag,
): value is ExtractByTag<E, TTag> {
  return hasTag(value, tag);
}

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

function makeYieldInstruction<T, E>(
  run: () => ResultValue<T, E> | Promise<ResultValue<T, E>>,
): YieldInstruction<T, E> {
  return {
    [RESULT_YIELD]: true,
    run,
  };
}

export class SyncResultChain<T, E> {
  private readonly runFn: () => ResultValue<T, E>;

  constructor(runFn: () => ResultValue<T, E>) {
    this.runFn = runFn;
  }

  toResult(): ResultValue<T, E> {
    return this.runFn();
  }

  map<U>(fn: (value: T) => U): SyncResultChain<U, E> {
    const runFn = this.runFn;
    return new SyncResultChain(function runMap() {
      const result = runFn();
      if (isErr(result)) {
        return result;
      }
      return ok(fn(result.value));
    });
  }

  mapErr<F>(fn: (error: E) => F): SyncResultChain<T, F> {
    const runFn = this.runFn;
    return new SyncResultChain(function runMapErr() {
      const result = runFn();
      if (isOk(result)) {
        return result;
      }
      return err(fn(result.error));
    });
  }

  andThen<U, F>(fn: (value: T) => SyncInput<U, F>): SyncResultChain<U, E | F> {
    const runFn = this.runFn;
    return new SyncResultChain(function runAndThen() {
      const result = runFn();
      if (isErr(result)) {
        return result as ResultValue<U, E | F>;
      }
      return resolveSyncInput(fn(result.value));
    });
  }

  catchAll<U, F>(fn: (error: E) => SyncInput<U, F>): SyncResultChain<T | U, F> {
    const runFn = this.runFn;
    return new SyncResultChain(function runCatchAll() {
      const result = runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, F>;
      }
      return resolveSyncInput(fn(result.error)) as ResultValue<T | U, F>;
    });
  }

  catchTag<TTag extends ExtractTag<E>, U, F>(
    tag: TTag,
    fn: (error: ExtractByTag<E, TTag>) => SyncInput<U, F>,
  ): SyncResultChain<T | U, ExcludeByTag<E, TTag> | F> {
    const runFn = this.runFn;
    return new SyncResultChain(function runCatchTag() {
      const result = runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
      }
      if (hasErrorTagIn(result.error, tag)) {
        return resolveSyncInput(fn(result.error)) as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
      }
      return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
    });
  }

  catchTags<THandlers extends SyncHandlers<E>>(
    handlers: THandlers,
  ): SyncResultChain<
    T | SyncHandlerValue<THandlers>,
    ExcludeHandled<E, Extract<keyof THandlers, string>> | SyncHandlerError<THandlers>
  > {
    const runFn = this.runFn;
    type TOutValue = T | SyncHandlerValue<THandlers>;
    type TOutError =
      | ExcludeHandled<E, Extract<keyof THandlers, string>>
      | SyncHandlerError<THandlers>;
    return new SyncResultChain<TOutValue, TOutError>(function runCatchTags() {
      const result = runFn();
      if (isOk(result)) {
        return result as ResultValue<TOutValue, TOutError>;
      }

      const errorValue = result.error;
      if (isObject(errorValue) && typeof errorValue._tag === 'string') {
        const handler = handlers[errorValue._tag as keyof THandlers] as
          | ((error: unknown) => SyncInput<unknown, unknown>)
          | undefined;
        if (handler) {
          return resolveSyncInput(handler(errorValue)) as ResultValue<TOutValue, TOutError>;
        }
      }

      return result as ResultValue<TOutValue, TOutError>;
    });
  }

  tapTag<TTag extends ExtractTag<E>>(
    tag: TTag,
    effect: (error: ExtractByTag<E, TTag>) => void,
  ): SyncResultChain<T, E> {
    const runFn = this.runFn;
    return new SyncResultChain(function runTapTag() {
      const result = runFn();
      if (isErr(result) && hasErrorTagIn(result.error, tag)) {
        try {
          effect(result.error);
        } catch {
          return result;
        }
      }
      return result;
    });
  }

  run(this: SyncResultChain<T, never>): T {
    const result = this.runFn();
    return (result as Ok<T>).value;
  }

  get value(): [E] extends [never] ? T : never {
    const result = this.runFn();
    return (result as Ok<T>).value as [E] extends [never] ? T : never;
  }

  unwrapOr(fallback: T): T {
    const result = this.runFn();
    return isOk(result) ? result.value : fallback;
  }

  match<A, B = A>(onOk: (value: T) => A, onErr: (error: E) => B): A | B {
    const result = this.runFn();
    return isOk(result) ? onOk(result.value) : onErr(result.error);
  }

  *[Symbol.iterator](): Generator<YieldInstruction<T, E>, T, ResultValue<T, E>> {
    const result = yield makeYieldInstruction(this.runFn);
    if (isErr(result)) {
      throw result.error;
    }
    return result.value;
  }
}

export class AsyncResultChain<T, E> {
  private readonly runFn: () => Promise<ResultValue<T, E>>;

  constructor(runFn: () => Promise<ResultValue<T, E>>) {
    this.runFn = runFn;
  }

  toPromise(): Promise<ResultValue<T, E>> {
    return this.runFn();
  }

  map<U>(fn: (value: T) => U | Promise<U>): AsyncResultChain<U, E> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runMap() {
      const result = await runFn();
      if (isErr(result)) {
        return result;
      }
      return ok(await fn(result.value));
    });
  }

  mapErr<F>(fn: (error: E) => F | Promise<F>): AsyncResultChain<T, F> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runMapErr() {
      const result = await runFn();
      if (isOk(result)) {
        return result;
      }
      return err(await fn(result.error));
    });
  }

  andThen<U, F>(
    fn: (value: T) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<U, E | F> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runAndThen() {
      const result = await runFn();
      if (isErr(result)) {
        return result as ResultValue<U, E | F>;
      }
      return resolveAsyncInput(await fn(result.value));
    });
  }

  catchAll<U, F>(
    fn: (error: E) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<T | U, F> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runCatchAll() {
      const result = await runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, F>;
      }
      return (await resolveAsyncInput(await fn(result.error))) as ResultValue<T | U, F>;
    });
  }

  catchTag<TTag extends ExtractTag<E>, U, F>(
    tag: TTag,
    fn: (error: ExtractByTag<E, TTag>) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<T | U, ExcludeByTag<E, TTag> | F> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runCatchTag() {
      const result = await runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
      }
      if (hasErrorTagIn(result.error, tag)) {
        return (await resolveAsyncInput(await fn(result.error))) as ResultValue<
          T | U,
          ExcludeByTag<E, TTag> | F
        >;
      }
      return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
    });
  }

  catchTags<THandlers extends AsyncHandlers<E>>(
    handlers: THandlers,
  ): AsyncResultChain<
    T | AsyncHandlerValue<THandlers>,
    ExcludeHandled<E, Extract<keyof THandlers, string>> | AsyncHandlerError<THandlers>
  > {
    const runFn = this.runFn;
    type TOutValue = T | AsyncHandlerValue<THandlers>;
    type TOutError =
      | ExcludeHandled<E, Extract<keyof THandlers, string>>
      | AsyncHandlerError<THandlers>;
    return new AsyncResultChain<TOutValue, TOutError>(async function runCatchTags() {
      const result = await runFn();
      if (isOk(result)) {
        return result as ResultValue<TOutValue, TOutError>;
      }

      const errorValue = result.error;
      if (isObject(errorValue) && typeof errorValue._tag === 'string') {
        const handler = handlers[errorValue._tag as keyof THandlers] as
          | ((error: unknown) => unknown)
          | undefined;
        if (handler) {
          return (await resolveAsyncInput(await handler(errorValue))) as ResultValue<
            TOutValue,
            TOutError
          >;
        }
      }

      return result as ResultValue<TOutValue, TOutError>;
    });
  }

  tapTag<TTag extends ExtractTag<E>>(
    tag: TTag,
    effect: (error: ExtractByTag<E, TTag>) => void | Promise<void>,
  ): AsyncResultChain<T, E> {
    const runFn = this.runFn;
    return new AsyncResultChain(async function runTapTag() {
      const result = await runFn();
      if (isErr(result) && hasErrorTagIn(result.error, tag)) {
        try {
          await effect(result.error);
        } catch {
          return result;
        }
      }
      return result;
    });
  }

  async run(this: AsyncResultChain<T, never>): Promise<T> {
    const result = await this.runFn();
    return (result as Ok<T>).value;
  }

  async unwrapOr(fallback: T): Promise<T> {
    const result = await this.runFn();
    return isOk(result) ? result.value : fallback;
  }

  async match<A, B = A>(
    onOk: (value: T) => A | Promise<A>,
    onErr: (error: E) => B | Promise<B>,
  ): Promise<A | B> {
    const result = await this.runFn();
    return isOk(result) ? onOk(result.value) : onErr(result.error);
  }

  *[Symbol.iterator](): Generator<YieldInstruction<T, E>, T, ResultValue<T, E>> {
    const runFn = this.runFn;

    function runYieldInstruction(): Promise<ResultValue<T, E>> {
      return runFn();
    }

    const result = yield makeYieldInstruction(runYieldInstruction);
    if (isErr(result)) {
      throw result.error;
    }
    return result.value;
  }
}

function runSyncGenerator<T, E>(
  generator: Generator<unknown, T, ResultValue<unknown, unknown>>,
): ResultValue<T, E> {
  let input: ResultValue<unknown, unknown> | undefined;

  while (true) {
    let step: IteratorResult<unknown, T>;
    try {
      step = generator.next(input as ResultValue<unknown, unknown>);
    } catch (caught) {
      return err(caught as E);
    }

    if (step.done) {
      return resolveSyncInput(step.value as SyncInput<T, E>);
    }

    try {
      const yielded = step.value;
      const result = isYieldInstruction(yielded)
        ? yielded.run()
        : resolveSyncInput(yielded as SyncInput<unknown, unknown>);

      if (isPromiseLike(result)) {
        throw new TypeError('Async result yielded in Result.try. Use Result.tryAsync.');
      }

      if (isErr(result)) {
        return result as ResultValue<T, E>;
      }

      input = result;
    } catch (caught) {
      return err(caught as E);
    }
  }
}

async function runAsyncGenerator<T, E>(
  generator: Generator<unknown, T, ResultValue<unknown, unknown>>,
): Promise<ResultValue<T, E>> {
  let input: ResultValue<unknown, unknown> | undefined;

  while (true) {
    let step: IteratorResult<unknown, T>;
    try {
      step = generator.next(input as ResultValue<unknown, unknown>);
    } catch (caught) {
      return err(caught as E);
    }

    if (step.done) {
      return resolveAsyncInput(step.value as AsyncInput<T, E>);
    }

    try {
      const yielded = step.value;
      const result = isYieldInstruction(yielded)
        ? await yielded.run()
        : await resolveAsyncInput(yielded as AsyncInput<unknown, unknown>);

      if (isErr(result)) {
        return result as ResultValue<T, E>;
      }

      input = result;
    } catch (caught) {
      return err(caught as E);
    }
  }
}

function mapResult<T, E, U>(input: SyncInput<T, E>, fn: (value: T) => U): ResultValue<U, E> {
  const value = resolveSyncInput(input);
  if (isErr(value)) {
    return value;
  }
  return ok(fn(value.value));
}

function mapErrResult<T, E, F>(input: SyncInput<T, E>, fn: (error: E) => F): ResultValue<T, F> {
  const value = resolveSyncInput(input);
  if (isOk(value)) {
    return value;
  }
  return err(fn(value.error));
}

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
        );
      }
      return resolveAsyncInput(output as AsyncInput<T, E>);
    } catch (caught) {
      return err(caught as E);
    }
  }

  return new AsyncResultChain(runTryAsync);
}

import { taggedError, TaggedError } from './tagged-error';

export const Result = {
  ok,
  err,
  isOk,
  isErr,
  map: mapResult,
  mapErr: mapErrResult,
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
  ok,
  err,
  isOk,
  isErr,
  mapResult as map,
  mapErrResult as mapErr,
  andThenResult as andThen,
  matchResult as match,
  unwrapOrResult as unwrapOr,
  fromThrowable,
  hasTag,
  hasTags,
  taggedError,
  trySync as try,
  tryAsync,
  TaggedError,
};

export type ResultNamespace = typeof Result;
export type {
  AsyncHandlers,
  AsyncInput,
  ExtractByTag,
  ExtractTag,
  ExcludeByTag,
  ExcludeHandled,
  InferAsyncError,
  InferAsyncSuccess,
  InferSyncError,
  InferSyncSuccess,
  SyncHandlers,
  SyncInput,
} from './types';
