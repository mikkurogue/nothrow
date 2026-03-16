export type Ok<T> = {
  _tag: 'Ok';
  value: T;
};

export type Err<E> = {
  _tag: 'Err';
  error: E;
};

export type ResultValue<T, E> = Ok<T> | Err<E>;

export type SyncGeneratorOutput<T> = Generator<unknown, T, ResultValue<unknown, unknown>>;

export type ExtractTag<E> = E extends { _tag: infer TTag extends string } ? TTag : never;
export type ExtractByTag<E, TTag extends string> = Extract<E, { _tag: TTag }>;
export type ExcludeByTag<E, TTag extends string> = E extends { _tag: TTag } ? never : E;

export type ExcludeHandled<E, Keys extends string> = E extends { _tag: infer TTag extends string }
  ? TTag extends Keys
    ? never
    : E
  : E;

export interface SyncChainLike<T, E> {
  toResult(): ResultValue<T, E>;
}

export interface AsyncChainLike<T, E> {
  toPromise(): Promise<ResultValue<T, E>>;
}

export type SyncInput<T, E> = ResultValue<T, E> | SyncChainLike<T, E> | T;
export type AsyncInput<T, E> = ResultValue<T, E> | SyncChainLike<T, E> | AsyncChainLike<T, E> | T;

export type SyncHandlers<E> = Partial<{
  [K in ExtractTag<E>]: (error: ExtractByTag<E, K>) => SyncInput<unknown, unknown>;
}>;

export type AsyncHandlers<E> = Partial<{
  [K in ExtractTag<E>]: (error: ExtractByTag<E, K>) => unknown;
}>;

type ErrorOfSyncInput<TInput> =
  TInput extends Ok<any>
    ? never
    : TInput extends Err<infer E>
      ? E
      : TInput extends SyncChainLike<any, infer E>
        ? E
        : TInput extends ResultValue<any, infer E>
          ? E
          : never;

type ValueOfSyncInput<TInput> =
  TInput extends Ok<infer T>
    ? T
    : TInput extends Err<any>
      ? never
      : TInput extends SyncChainLike<infer T, any>
        ? T
        : TInput extends ResultValue<infer T, any>
          ? T
          : TInput;

type ErrorOfAsyncInput<TInput> =
  TInput extends Ok<any>
    ? never
    : TInput extends Err<infer E>
      ? E
      : TInput extends SyncChainLike<any, infer E>
        ? E
        : TInput extends AsyncChainLike<any, infer E>
          ? E
          : TInput extends ResultValue<any, infer E>
            ? E
            : never;

type ValueOfAsyncInput<TInput> =
  TInput extends Ok<infer T>
    ? T
    : TInput extends Err<any>
      ? never
      : TInput extends SyncChainLike<infer T, any>
        ? T
        : TInput extends AsyncChainLike<infer T, any>
          ? T
          : TInput extends ResultValue<infer T, any>
            ? T
            : TInput;

export type SyncHandlerError<THandlers> = {
  [K in keyof THandlers]: THandlers[K] extends (...args: any[]) => infer R
    ? ErrorOfSyncInput<R>
    : never;
}[keyof THandlers];

export type SyncHandlerValue<THandlers> = {
  [K in keyof THandlers]: THandlers[K] extends (...args: any[]) => infer R
    ? ValueOfSyncInput<R>
    : never;
}[keyof THandlers];

export type AsyncHandlerError<THandlers> = {
  [K in keyof THandlers]: THandlers[K] extends (...args: any[]) => infer R
    ? ErrorOfAsyncInput<Awaited<R>>
    : never;
}[keyof THandlers];

export type AsyncHandlerValue<THandlers> = {
  [K in keyof THandlers]: THandlers[K] extends (...args: any[]) => infer R
    ? ValueOfAsyncInput<Awaited<R>>
    : never;
}[keyof THandlers];

export type InferSyncSuccess<TOutput> =
  TOutput extends Ok<infer T>
    ? T
    : TOutput extends Err<any>
      ? never
      : TOutput extends SyncChainLike<infer T, any>
        ? T
        : TOutput extends ResultValue<infer T, any>
          ? T
          : TOutput extends SyncGeneratorOutput<infer T>
            ? T
            : TOutput;

export type InferSyncError<TOutput> =
  TOutput extends SyncChainLike<any, infer E>
    ? E
    : TOutput extends ResultValue<any, infer E>
      ? E
      : TOutput extends SyncGeneratorOutput<any>
        ? unknown
        : never;

export type InferAsyncSuccess<TOutput> = InferAsyncSuccessInner<Awaited<TOutput>>;

type InferAsyncSuccessInner<TOutput> =
  TOutput extends Ok<infer T>
    ? T
    : TOutput extends Err<any>
      ? never
      : TOutput extends SyncChainLike<infer T, any>
        ? T
        : TOutput extends AsyncChainLike<infer T, any>
          ? T
          : TOutput extends ResultValue<infer T, any>
            ? T
            : TOutput extends SyncGeneratorOutput<infer T>
              ? T
              : TOutput;

export type InferAsyncError<TOutput> = InferAsyncErrorInner<Awaited<TOutput>>;

type InferAsyncErrorInner<TOutput> =
  TOutput extends SyncChainLike<any, infer E>
    ? E
    : TOutput extends AsyncChainLike<any, infer E>
      ? E
      : TOutput extends ResultValue<any, infer E>
        ? E
        : TOutput extends SyncGeneratorOutput<any>
          ? unknown
          : never;
