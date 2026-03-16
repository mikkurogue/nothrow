import type {
  AsyncHandlerError,
  AsyncHandlerValue,
  AsyncHandlers,
  AsyncInput,
  ExcludeByTag,
  ExcludeHandled,
  ExtractByTag,
  ExtractTag,
  ResultValue,
  SyncHandlerError,
  SyncHandlerValue,
  SyncHandlers,
  SyncInput,
} from '../types';

import { hasErrorTagIn, isObject } from './guards';
import { err, isErr, isOk, ok, unwrapOkOrThrow } from './result';

export type YieldInstruction<T, E> = {
  [RESULT_YIELD]: true;
  run: () => ResultValue<T, E> | Promise<ResultValue<T, E>>;
};

export const RESULT_YIELD = Symbol('nothrow.result.yield');

export type ChainResolvers = {
  resolveSyncInput: <T, E>(input: SyncInput<T, E>) => ResultValue<T, E>;
  resolveAsyncInput: <T, E>(
    input: AsyncInput<T, E> | Promise<AsyncInput<T, E>>,
  ) => Promise<ResultValue<T, E>>;
};

const uninitializedResolvers: ChainResolvers = {
  resolveSyncInput() {
    throw new Error('Sync resolver is not initialized.');
  },
  async resolveAsyncInput() {
    throw new Error('Async resolver is not initialized.');
  },
};

export function isYieldInstruction<T, E>(value: unknown): value is YieldInstruction<T, E> {
  return isObject(value) && value[RESULT_YIELD] === true && typeof value.run === 'function';
}

export function makeYieldInstruction<T, E>(
  run: () => ResultValue<T, E> | Promise<ResultValue<T, E>>,
): YieldInstruction<T, E> {
  return {
    [RESULT_YIELD]: true,
    run,
  };
}

export class SyncResultChain<T, E> {
  private readonly runFn: () => ResultValue<T, E>;
  private readonly resolvers: ChainResolvers;

  constructor(runFn: () => ResultValue<T, E>, resolvers: ChainResolvers = uninitializedResolvers) {
    this.runFn = runFn;
    this.resolvers = resolvers;
  }

  toResult(): ResultValue<T, E> {
    return this.runFn();
  }

  map<U>(fn: (value: T) => U): SyncResultChain<U, E> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    return new SyncResultChain(function runMap() {
      const result = runFn();
      if (isErr(result)) {
        return result;
      }
      return ok(fn(result.value));
    }, resolvers);
  }

  mapErr<F>(fn: (error: E) => F): SyncResultChain<T, F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    return new SyncResultChain(function runMapErr() {
      const result = runFn();
      if (isOk(result)) {
        return result;
      }
      return err(fn(result.error));
    }, resolvers);
  }

  andThen<U, F>(fn: (value: T) => SyncInput<U, F>): SyncResultChain<U, E | F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveSyncInput = resolvers.resolveSyncInput;
    return new SyncResultChain(function runAndThen() {
      const result = runFn();
      if (isErr(result)) {
        return result as ResultValue<U, E | F>;
      }
      return resolveSyncInput(fn(result.value));
    }, resolvers);
  }

  catchAll<U, F>(fn: (error: E) => SyncInput<U, F>): SyncResultChain<T | U, F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveSyncInput = resolvers.resolveSyncInput;
    return new SyncResultChain(function runCatchAll() {
      const result = runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, F>;
      }
      return resolveSyncInput(fn(result.error)) as ResultValue<T | U, F>;
    }, resolvers);
  }

  catchTag<TTag extends ExtractTag<E>, U, F>(
    tag: TTag,
    fn: (error: ExtractByTag<E, TTag>) => SyncInput<U, F>,
  ): SyncResultChain<T | U, ExcludeByTag<E, TTag> | F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveSyncInput = resolvers.resolveSyncInput;
    return new SyncResultChain(function runCatchTag() {
      const result = runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
      }
      if (hasErrorTagIn(result.error, tag)) {
        return resolveSyncInput(fn(result.error)) as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
      }
      return result as ResultValue<T | U, ExcludeByTag<E, TTag> | F>;
    }, resolvers);
  }

  catchTags<THandlers extends SyncHandlers<E>>(
    handlers: THandlers,
  ): SyncResultChain<
    T | SyncHandlerValue<THandlers>,
    ExcludeHandled<E, Extract<keyof THandlers, string>> | SyncHandlerError<THandlers>
  > {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveSyncInput = resolvers.resolveSyncInput;
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
    }, resolvers);
  }

  tapTag<TTag extends ExtractTag<E>>(
    tag: TTag,
    effect: (error: ExtractByTag<E, TTag>) => void,
  ): SyncResultChain<T, E> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
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
    }, resolvers);
  }

  run(this: SyncResultChain<T, never>): T {
    return unwrapOkOrThrow(this.runFn(), 'SyncResultChain.run()');
  }

  get value(): [E] extends [never] ? T : never {
    return unwrapOkOrThrow(this.runFn(), 'SyncResultChain.value') as [E] extends [never]
      ? T
      : never;
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
  private readonly resolvers: ChainResolvers;

  constructor(
    runFn: () => Promise<ResultValue<T, E>>,
    resolvers: ChainResolvers = uninitializedResolvers,
  ) {
    this.runFn = runFn;
    this.resolvers = resolvers;
  }

  toPromise(): Promise<ResultValue<T, E>> {
    return this.runFn();
  }

  map<U>(fn: (value: T) => U | Promise<U>): AsyncResultChain<U, E> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    return new AsyncResultChain(async function runMap() {
      const result = await runFn();
      if (isErr(result)) {
        return result;
      }
      return {
        _tag: 'Ok',
        value: await fn(result.value),
      };
    }, resolvers);
  }

  mapErr<F>(fn: (error: E) => F | Promise<F>): AsyncResultChain<T, F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    return new AsyncResultChain(async function runMapErr() {
      const result = await runFn();
      if (isOk(result)) {
        return result;
      }
      return {
        _tag: 'Err',
        error: await fn(result.error),
      };
    }, resolvers);
  }

  andThen<U, F>(
    fn: (value: T) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<U, E | F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveAsyncInput = resolvers.resolveAsyncInput;
    return new AsyncResultChain(async function runAndThen() {
      const result = await runFn();
      if (isErr(result)) {
        return result as ResultValue<U, E | F>;
      }
      return resolveAsyncInput(await fn(result.value));
    }, resolvers);
  }

  catchAll<U, F>(
    fn: (error: E) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<T | U, F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveAsyncInput = resolvers.resolveAsyncInput;
    return new AsyncResultChain(async function runCatchAll() {
      const result = await runFn();
      if (isOk(result)) {
        return result as ResultValue<T | U, F>;
      }
      return (await resolveAsyncInput(await fn(result.error))) as ResultValue<T | U, F>;
    }, resolvers);
  }

  catchTag<TTag extends ExtractTag<E>, U, F>(
    tag: TTag,
    fn: (error: ExtractByTag<E, TTag>) => AsyncInput<U, F> | Promise<AsyncInput<U, F>>,
  ): AsyncResultChain<T | U, ExcludeByTag<E, TTag> | F> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveAsyncInput = resolvers.resolveAsyncInput;
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
    }, resolvers);
  }

  catchTags<THandlers extends AsyncHandlers<E>>(
    handlers: THandlers,
  ): AsyncResultChain<
    T | AsyncHandlerValue<THandlers>,
    ExcludeHandled<E, Extract<keyof THandlers, string>> | AsyncHandlerError<THandlers>
  > {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
    const resolveAsyncInput = resolvers.resolveAsyncInput;
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
    }, resolvers);
  }

  tapTag<TTag extends ExtractTag<E>>(
    tag: TTag,
    effect: (error: ExtractByTag<E, TTag>) => void | Promise<void>,
  ): AsyncResultChain<T, E> {
    const runFn = this.runFn;
    const resolvers = this.resolvers;
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
    }, resolvers);
  }

  async run(this: AsyncResultChain<T, never>): Promise<T> {
    return unwrapOkOrThrow(await this.runFn(), 'AsyncResultChain.run()');
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
