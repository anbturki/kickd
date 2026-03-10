import { test, expect, describe, afterEach } from "bun:test";
import { setVariable, getVariable, deleteVariable, listVariables, resolveTemplate } from "../src/variables";

describe("variables", () => {
  afterEach(() => {
    // Clean up test variables
    deleteVariable("test_key");
    deleteVariable("test_key2");
    deleteVariable("greeting");
    deleteVariable("name");
  });

  test("set and get", () => {
    setVariable("test_key", "test_value");
    expect(getVariable("test_key")).toBe("test_value");
  });

  test("overwrite", () => {
    setVariable("test_key", "v1");
    setVariable("test_key", "v2");
    expect(getVariable("test_key")).toBe("v2");
  });

  test("delete", () => {
    setVariable("test_key", "v1");
    expect(deleteVariable("test_key")).toBe(true);
    expect(getVariable("test_key")).toBeNull();
  });

  test("delete nonexistent", () => {
    expect(deleteVariable("nonexistent_var_xyz")).toBe(false);
  });

  test("list by scope", () => {
    setVariable("test_key", "v1", "global");
    setVariable("test_key2", "v2", "workflow");
    const globals = listVariables("global");
    const hasTestKey = globals.some((v) => v.key === "test_key");
    const hasTestKey2 = globals.some((v) => v.key === "test_key2");
    expect(hasTestKey).toBe(true);
    expect(hasTestKey2).toBe(false);
  });

  test("resolve template", () => {
    setVariable("greeting", "Hello");
    setVariable("name", "World");
    const result = resolveTemplate("{{var:greeting}} {{var:name}}!");
    expect(result).toBe("Hello World!");
  });

  test("resolve missing variable returns empty", () => {
    const result = resolveTemplate("Hey {{var:missing_var_xyz}}!");
    expect(result).toBe("Hey !");
  });
});
