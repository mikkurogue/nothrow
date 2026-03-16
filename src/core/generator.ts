import type { AsyncInput, ResultValue, SyncInput } from '../types';

import { isErr, isPromiseLike } from './guards';
import type { YieldInstruction } from './chains';
import { isYieldInstruction } from './chains';
import { err } from './result';

export function runSyncGenerator<T, E>(
  generator: Generator<unknown, T, ResultValue<unknown, unknown>>,
  resolveSyncInput: <TValue, EValue>(
    input: SyncInput<TValue, EValue>,
  ) => ResultValue<TValue, EValue>,
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

export async function runAsyncGenerator<T, E>(
  generator: Generator<unknown, T, ResultValue<unknown, unknown>>,
  resolveAsyncInput: <TValue, EValue>(
    input: AsyncInput<TValue, EValue> | Promise<AsyncInput<TValue, EValue>>,
  ) => Promise<ResultValue<TValue, EValue>>,
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
        ? await (yielded as YieldInstruction<unknown, unknown>).run()
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
