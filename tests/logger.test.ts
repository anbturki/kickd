import { test, expect, describe } from "bun:test";
import { logger } from "../src/logger";

describe("logger", () => {
  test("creates child logger", () => {
    const log = logger.child("test-module");
    expect(log).toBeDefined();
    // Should not throw
    log.info("test message");
    log.debug("debug message");
    log.warn("warn message");
    log.error("error message", { key: "value" });
  });
});
