export class TaggedError<TTag extends string> extends Error {
  readonly _tag: TTag;

  constructor(tag: TTag, fields?: Record<string, unknown>) {
    const message =
      fields && typeof fields.message === 'string' ? fields.message : `${tag} error occurred`;
    const cause = fields ? fields.cause : undefined;

    super(message, cause === undefined ? undefined : { cause });
    this.name = tag;
    this._tag = tag;

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (key === '_tag' || key === 'message' || key === 'cause') {
          continue;
        }
        (this as Record<string, unknown>)[key] = value;
      }
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type TaggedErrorCtor<TTag extends string, TFields extends Record<string, unknown>> = new (
  fields: TFields & { message?: string; cause?: unknown },
) => TaggedError<TTag> & Readonly<TFields>;

export function taggedError<const TTag extends string>(tag: TTag) {
  return function makeTaggedError<TFields extends Record<string, unknown> = {}>() {
    class SpecificTaggedError extends TaggedError<TTag> {
      constructor(fields?: TFields & { message?: string; cause?: unknown }) {
        super(tag, fields as Record<string, unknown> | undefined);
      }
    }

    Object.defineProperty(SpecificTaggedError, 'name', {
      value: tag,
    });

    return SpecificTaggedError as unknown as TaggedErrorCtor<TTag, TFields>;
  };
}
