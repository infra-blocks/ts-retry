# ts-retry
[![Build](https://github.com/infra-blocks/ts-retry/actions/workflows/build.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/build.yml)
[![Release](https://github.com/infra-blocks/ts-retry/actions/workflows/release.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/release.yml)
[![Update From Template](https://github.com/infra-blocks/ts-retry/actions/workflows/update-from-template.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/update-from-template.yml)

This repository exports generic retry utilities. It leverages the [promise-retry](https://www.npmjs.com/package/promise-retry) library under the hood.
It extends it with an event emitter API and renames some of its configuration variables.

# Retry configuration

The retry configuration uses the following values:
- `minIntervalMs`. The minimum wait time between attempts. Defaults to `1000`.
- `maxIntervalMs`. The maximum wait time between attempts. Defaults to `Infinity`.
- `factor`. The exponential factor to use. See LINK. Defaults to `1`.
- `retries`. The amount of *retries* made (not including the first call). Defaults to `60`.
- `isRetryableError`. A predicate function that determines whether an error should trigger a retry. Defaults to `() => true`.

You invoke it as such with the default configuration:
```ts
import {retry} from "@infra-blocks/retry";

// This promise resolves when `myFunc` resolves, or rejects with the last error returned
// by `myFunc` on that last retry.
await retry(myFunc);
```

To tweak its behaviors, simply pass the desired modifications as the second argument to the retry
invocation:
```ts
await retry(
    myFunc,
    {
        retries: 9,
        factor: 2,
        minIntervalMs: 150,
        maxIntervalMs: 20_000,
        isRetryableError: (err) => err.name === "RetryableError"
    }
);
```

# Event emitter API

The API also allows caller code to subscribe to `attempt` and `retry` events. `attempt` events are emitted on *every* attempt, including
the first. `retry` events only start being emitted on the *second* attempt, meaning an error always occurred before a `retry` event.

The `attempt` event handler has the following call signature:
```ts
(params: {
    attempt: number; // Starts at 1.
    retryConfig: Required<RetryConfig<E>>; // This is the effective retry configuration used. 
}) => void;`
```
And the `retry` event handler has the following call signature:
```ts
(params: {
    retry: number; // Starts at 1.
    retryConfig: Required<RetryConfig<E>>;
}) => void;
```

Example:
```ts
await retry(startMongoDbContainer)
    .once("attempt", () => logger.info("starting MongoDB container"))
    .on("retry", ({retry}) => logger.debug(`polling MongoDB for health check, retry: ${retry}`));
```
