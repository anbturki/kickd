import { test, expect, describe } from "bun:test";
import { parseCron, nextOccurrence, isCronExpression } from "../src/cron";

describe("isCronExpression", () => {
  test("valid 5-field cron", () => {
    expect(isCronExpression("* * * * *")).toBe(true);
    expect(isCronExpression("0 9 * * MON-FRI")).toBe(true);
    expect(isCronExpression("*/15 * * * *")).toBe(true);
    expect(isCronExpression("0 0 1 * *")).toBe(true);
  });

  test("invalid expressions", () => {
    expect(isCronExpression("1h")).toBe(false);
    expect(isCronExpression("at:09:00")).toBe(false);
    expect(isCronExpression("hello")).toBe(false);
    expect(isCronExpression("")).toBe(false);
  });
});

describe("parseCron", () => {
  test("every minute (wildcard)", () => {
    const schedule = parseCron("* * * * *");
    expect(schedule.minute.type).toBe("wildcard");
    expect(schedule.hour.type).toBe("wildcard");
  });

  test("specific time", () => {
    const schedule = parseCron("30 9 * * *");
    expect(schedule.minute.type).toBe("values");
    expect(schedule.minute.values).toEqual([30]);
    expect(schedule.hour.values).toEqual([9]);
  });

  test("ranges", () => {
    const schedule = parseCron("0 9-17 * * *");
    expect(schedule.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  test("steps", () => {
    const schedule = parseCron("*/15 * * * *");
    expect(schedule.minute.values).toEqual([0, 15, 30, 45]);
  });

  test("lists", () => {
    const schedule = parseCron("0 9,12,18 * * *");
    expect(schedule.hour.values).toEqual([9, 12, 18]);
  });

  test("named days", () => {
    const schedule = parseCron("0 9 * * MON-FRI");
    expect(schedule.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("nextOccurrence", () => {
  test("finds next minute for every-minute cron", () => {
    const schedule = parseCron("* * * * *");
    const now = new Date("2026-03-10T10:30:00Z");
    const next = nextOccurrence(schedule, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  test("finds next occurrence for specific time", () => {
    const schedule = parseCron("0 9 * * *");
    const now = new Date("2026-03-10T10:00:00Z");
    const next = nextOccurrence(schedule, now);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(0);
  });
});
