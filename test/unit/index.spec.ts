import { DEFAULT_RETRY_CONFIG, retry } from "../../src/index.js";
import { expect, sinon } from "@infra-blocks/test";
import { range } from "@infra-blocks/iter";
import VError from "verror";

declare module "mocha" {
  interface Context {
    clock: sinon.SinonFakeTimers;
  }
}

describe("index", function () {
  describe(retry.name, function () {
    beforeEach("setup timers", function () {
      this.clock = sinon.useFakeTimers();
    });

    afterEach("tear down timers", function () {
      this.clock.restore();
    });

    function waitTime(params: {
      attempt: number;
      factor?: number;
      minIntervalMs?: number;
    }): number {
      const {
        attempt,
        factor = DEFAULT_RETRY_CONFIG.factor,
        minIntervalMs = DEFAULT_RETRY_CONFIG.minIntervalMs,
      } = params;
      // We consider the attempt number the current one, but the wait time is calculated on the past number of
      // retries. The first attempt does not count as a retry.
      return Math.pow(factor, attempt - 2) * minIntervalMs;
    }

    async function test<
      T
    >(params: { clock: sinon.SinonFakeTimers; inner: sinon.SinonSpy; retryPromise: PromiseLike<T>; retries?: number; factor?: number; minIntervalMs?: number }): Promise<void> {
      const {
        clock,
        inner,
        retryPromise,
        retries = DEFAULT_RETRY_CONFIG.retries,
        factor = DEFAULT_RETRY_CONFIG.factor,
        minIntervalMs = DEFAULT_RETRY_CONFIG.minIntervalMs,
      } = params;

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
        clock: this.clock,
        inner,
        retryPromise: retry(inner),
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
        clock: this.clock,
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
      await this.clock.tickAsync(1);
      expect(inner).to.have.callCount(1);
      expect(failedCorrectly).to.be.false;

      await this.clock.tickAsync(waitTime({ attempt: 2 }));
      expect(inner).to.have.callCount(2);
      expect(failedCorrectly).to.be.true;
    });

    it("should stop after a success and resolve to the right value", async function () {
      let callCount = 0;
      const inner = sinon.fake(() => {
        callCount += 1;
        if (callCount < 5) {
          return Promise.reject(new Error("try harder"));
        }
        return Promise.resolve(10);
      });
      const r = retry(inner);
      // Run the callbacks submitted for next loop iteration.
      await this.clock.tickAsync(1);

      for (const attempt of range(2, 6)) {
        await this.clock.tickAsync(waitTime({ attempt }));
      }
      await expect(r).to.eventually.equal(10);
    });
    it("should emit the 'attempt' and 'retry' events correctly", async function () {
      const inner = sinon.fake.rejects(new Error("try harder"));
      const onAttempt = sinon.fake();
      const onRetry = sinon.fake();
      const retries = 5;
      // This test finishes before we run out of retries.
      void retry(inner, { retries })
        .on("attempt", onAttempt)
        .on("retry", onRetry);

      await this.clock.tickAsync(1);
      expect(onAttempt).to.have.been.calledOnce;
      expect(onAttempt.getCall(0)).to.have.been.calledWithMatch({ attempt: 1 });
      expect(onRetry).to.not.have.been.called;

      await this.clock.tickAsync(waitTime({ attempt: 2 }));
      expect(onAttempt).to.have.been.calledTwice;
      expect(onAttempt.getCall(1)).to.have.been.calledWithMatch({ attempt: 2 });
      expect(onRetry).to.have.been.calledOnce;
      expect(onRetry.getCall(0)).to.have.been.calledWithMatch({ retry: 1 });

      await this.clock.tickAsync(waitTime({ attempt: 3 }));
      expect(onAttempt).to.have.been.calledThrice;
      expect(onAttempt.getCall(2)).to.have.been.calledWithMatch({ attempt: 3 });
      expect(onRetry).to.have.been.calledTwice;
      expect(onRetry.getCall(1)).to.have.been.calledWithMatch({ retry: 2 });
    });
  });
});
