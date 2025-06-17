import promiseRetry = require("promise-retry");
import { EmitterLike, EmitterLikeBase, Predicate } from "@infra-blocks/types";

/**
 * Default retry configuration.
 *
 * The default configuration retries 60 times, with a factor of 1 and a minimum interval of 1000ms.
 * The maximum interval is set to Infinity, meaning that there is no upper bound on the wait time.
 *
 * When no field is overridden, this config will result in retrying the function every second
 * for a minute. Note that retries don't include the first attempt, so the inner function is
 * called 61 times in total.
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig<unknown>> = {
  retries: 60,
  factor: 1,
  minIntervalMs: 1000,
  maxIntervalMs: Infinity,
  isRetryableError: (): boolean => true,
};

/**
 * Configuration for the retry function.
 */
export interface RetryConfig<E = Error> {
  /**
   * The amount of retries that will be attempted. Note that the first attempt
   * doest not count as a retry. In total, the amount of retries plus one
   * attempts will be made, in the worst case scenario.
   */
  retries?: number;
  /**
   * The exponential backoff factor that will be used between retries.
   * The actual wait time can be calculated as such:
   * wait time = min((factor ^ retry) * minIntervalMs, maxIntervalMs)
   */
  factor?: number;
  /**
   * The minimum wait time, in milliseconds, before the first retry.
   * When the factor is 1, the wait time between retries is constant and
   * equal to this value.
   */
  minIntervalMs?: number;
  /**
   * The maximum wait time between retries can be bound using this option.
   */
  maxIntervalMs?: number;
  /**
   * A predicate used to determine if an error should warrant a retry or not.
   *
   * When the function returns true, a retry will be attempted. When it returns
   * false, the process immediately fails and throws the error.
   *
   * @param err - The error received from the inner function.
   * @returns True if the function should be retried, false otherwise.
   */
  isRetryableError?: Predicate<E>;
}

/**
 * Events and their handler types for the {@link Retry}.
 */
export type RetryEvents<E = Error> = {
  /**
   * This event is emitted at the beginning of every attempt.
   *
   * @param attempt - The attempt number. Starts with 1, and the first attempt does not count as a retry.
   */
  attempt: (params: {
    attempt: number;
    retryConfig: Required<RetryConfig<E>>;
  }) => void;
};

/**
 * Type returned by the {@link retry} function.
 *
 * This type is both a promise and an event emitter, where the events are described as in
 * {@link RetryEvents}.
 */
export interface Retry<T, E = Error>
  extends EmitterLike<RetryEvents<E>>,
    PromiseLike<T> {}

/**
 * The type of the inner function that is wrapped by the {@link retry} function.
 */
export type RetryFunction<R> = () => Promise<R>;

class RetryImpl<T, E>
  extends EmitterLikeBase<RetryEvents<E>>
  implements Retry<T, E>
{
  protected readonly promise: PromiseLike<T>;
  protected readonly retryConfig: Required<RetryConfig<E>>;

  constructor(fn: RetryFunction<T>, options?: RetryConfig<E>) {
    super();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options };

    const wrapper = (attempt: number) => {
      this.emit("attempt", {
        attempt,
        retryConfig: { ...this.retryConfig },
      });
      return fn();
    };
    this.promise = retryPromise(wrapper, this.retryConfig);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }
}

/**
 * Returns a {@link Retry} object that wraps the provided function.
 *
 * @param fn - The inner function that will be retried.
 * @param options - The configuration for the retry process, such as defined in {@link RetryConfig}.
 *
 * @returns A {@link Retry} that is configured with the provided arguments.
 */
export function retry<T, E = Error>(
  fn: RetryFunction<T>,
  options?: RetryConfig<E>
): Retry<T, E> {
  return new RetryImpl(fn, options);
}

/**
 * The wraps a function into a retry promise.
 *
 * The promise resolves when the function resolves, or when the retry configuration determines so.
 * The promise will reject is the inner function throws an error that is not retryable, or
 * if the maximum amount of retries has been reached.
 *
 * @param fn - The inner function that will be retried.
 * @param options - The retry configuration, such as defined in {@link RetryConfig}.
 *
 * @returns A promise wrapping the inner function with retry logic.
 */
async function retryPromise<T, E = Error>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryConfig<E>
): Promise<T> {
  const { retries, factor, minIntervalMs, maxIntervalMs, isRetryableError } = {
    ...DEFAULT_RETRY_CONFIG,
    ...options,
  };

  return await promiseRetry(
    { retries, factor, minTimeout: minIntervalMs, maxTimeout: maxIntervalMs },
    async (retryInner, attempt) => {
      try {
        return await fn(attempt);
      } catch (err) {
        if (isRetryableError(err as E)) {
          return retryInner(err);
        }
        throw err;
      }
    }
  );
}
