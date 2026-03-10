import { test, expect, describe } from "bun:test";
import { TaskQueue } from "../src/queue";

describe("TaskQueue", () => {
  test("processes items in order", async () => {
    const queue = new TaskQueue({ concurrency: 1, maxSize: 10 });
    const results: number[] = [];

    await Promise.all([
      queue.add("a", async () => { results.push(1); return 1; }),
      queue.add("b", async () => { results.push(2); return 2; }),
      queue.add("c", async () => { results.push(3); return 3; }),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  test("respects concurrency limit", async () => {
    const queue = new TaskQueue({ concurrency: 2, maxSize: 10 });
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
    };

    await Promise.all([
      queue.add("a", task),
      queue.add("b", task),
      queue.add("c", task),
      queue.add("d", task),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  test("rejects when full", async () => {
    const queue = new TaskQueue({ concurrency: 1, maxSize: 2 });

    // Fill up the queue with slow tasks
    const p1 = queue.add("a", () => new Promise((r) => setTimeout(r, 100)));
    const p2 = queue.add("b", () => new Promise((r) => setTimeout(r, 100)));
    const p3 = queue.add("c", () => new Promise((r) => setTimeout(r, 100)));

    try {
      await queue.add("d", async () => "too much");
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("Queue is full");
    }

    await Promise.all([p1, p2, p3]);
  });

  test("returns stats", () => {
    const queue = new TaskQueue({ concurrency: 3, maxSize: 100 });
    const stats = queue.stats();
    expect(stats.concurrency).toBe(3);
    expect(stats.maxSize).toBe(100);
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
  });

  test("priority ordering", async () => {
    const queue = new TaskQueue({ concurrency: 1, maxSize: 10 });
    const results: string[] = [];

    // First item starts immediately, others queue up
    const blocker = queue.add("blocker", () => new Promise((r) => setTimeout(r, 50)));
    const low = queue.add("low", async () => { results.push("low"); }, 0);
    const high = queue.add("high", async () => { results.push("high"); }, 10);
    const mid = queue.add("mid", async () => { results.push("mid"); }, 5);

    await Promise.all([blocker, low, high, mid]);

    // High priority should run before mid, mid before low
    expect(results).toEqual(["high", "mid", "low"]);
  });
});
