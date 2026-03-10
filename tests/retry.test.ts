import { test, expect, describe } from "bun:test";
import { withRetry } from "../src/retry";
import type { RetryConfig } from "../src/retry";

const fastRetry: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 50,
  backoffMultiplier: 2,
};

describe("withRetry", () => {
  test("succeeds on first try", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    }, fastRetry);

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on failure then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "ok";
    }, fastRetry);

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("throws after all attempts exhausted", async () => {
    let calls = 0;
    try {
      await withRetry(async () => {
        calls++;
        throw new Error("always fails");
      }, fastRetry);
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect(calls).toBe(3);
      expect((err as Error).message).toBe("always fails");
    }
  });

  test("calls onRetry callback", async () => {
    const retries: number[] = [];
    let calls = 0;

    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "ok";
      },
      fastRetry,
      (attempt) => {
        retries.push(attempt);
      }
    );

    expect(retries).toEqual([1, 2]);
  });
});
