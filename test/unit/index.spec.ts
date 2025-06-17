import { retry } from "../../src/index.js";
import { expect, sinon } from "@infra-blocks/test";
import { range } from "@infra-blocks/iter";
import VError from "verror";

describe("retry", function () {
  describe(retry.name, function () {
    let clock: sinon.SinonFakeTimers;
    beforeEach("setup timers", () => {
      clock = sinon.useFakeTimers();
    });

    afterEach("tear down timers", () => {
      clock.restore();
    });

    function waitTime(params: {
      attempt: number;
      factor: number;
      minIntervalMs: number;
    }): number {
      const { attempt, factor, minIntervalMs } = params;
      // We consider the attempt number the current one, but the wait time is calculated on the past number of
      // retries. The first attempt does not count as a retry.
      return Math.pow(factor, attempt - 2) * minIntervalMs;
    }

    async function test<
      T
    >(params: { inner: sinon.SinonSpy; retryPromise: PromiseLike<T>; retries: number; factor: number; minIntervalMs: number }): Promise<void> {
      const { inner, retryPromise, retries, factor, minIntervalMs } = params;

      const result = retryPromise.then(null, () => true);
      // Run the callbacks submitted for next loop iteration.
      await clock.tickAsync(1);
      expect(inner).to.have.callCount(1);

      for (const attempt of range(2, retries + 2)) {
        await clock.tickAsync(waitTime({ attempt, factor, minIntervalMs }));
        expect(inner).to.have.callCount(attempt);
      }
      // Do an extra one to show nothing changes.
      await clock.tickAsync(
        waitTime({ attempt: retries * 2, factor, minIntervalMs })
      );
      expect(inner).to.have.callCount(retries + 1);

      await expect(result).to.eventually.be.true;
    }

    it("should default to retrying every second for 60 seconds", async function () {
      const inner = sinon.fake.rejects(new Error("always failing"));
      await test({
        inner,
        retryPromise: retry(inner),
        retries: 60,
        factor: 1,
        minIntervalMs: 1000,
      });
    });

    it("should respect the options", async function () {
      const inner = sinon.fake.rejects(new Error("always failing"));
      // You have to be careful with how large the numbers become, as it seems
      // to not play well with fake timers.
      const retries = 20;
      const factor = 2;
      const minIntervalMs = 500;
      await test({
        inner,
        retryPromise: retry(inner, { retries, factor, minIntervalMs }),
        retries,
        factor,
        minIntervalMs,
      });
    });

    it("should respect the predicate to test errors with", async function () {
      const inner = sinon.stub();
      inner
        .onFirstCall()
        .rejects(new VError({ name: "RetryableError" }, "retry me pls"))
        .onSecondCall()
        .rejects(new Error("Should go boom"));
      const isRetryableError = sinon.fake(
        (err: Error) => err.name === "RetryableError"
      );

      let failedCorrectly = false;
      retry(inner, { isRetryableError }).then(null, (err: Error) => {
        // Using this approach to not trigger unhandled promise rejections, as would happen
        // by just checking the promise at the end of the test.
        expect(err.message).to.equal("Should go boom");
        failedCorrectly = true;
      });
      await clock.tickAsync(1);
      expect(inner).to.have.callCount(1);
      expect(failedCorrectly).to.be.false;

      await clock.tickAsync(
        waitTime({ attempt: 2, factor: 1, minIntervalMs: 1000 })
      );
      expect(inner).to.have.callCount(2);

      expect(failedCorrectly).to.be.true;
    });

    it("should stop after a success and resolve to the right value", async function () {
      const inner = () => Promise.resolve(10);
      const retryPromise = retry(inner).on("attempt", ({ attempt }) => {
        if (attempt < 5) {
          throw new Error("didn't try enough");
        }
      });
      // Run the callbacks submitted for next loop iteration.
      await clock.tickAsync(1);

      for (const attempt of range(2, 6)) {
        await clock.tickAsync(
          waitTime({ attempt, factor: 1, minIntervalMs: 1000 })
        );
      }
      await expect(retryPromise).to.eventually.equal(10);
    });
  });
});
