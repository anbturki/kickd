import { Hono } from "hono";
import { setVariable, getVariable, deleteVariable, listVariables } from "../variables";

export const variableRoutes = new Hono();

variableRoutes.get("/", (c) => {
  const scope = c.req.query("scope");
  return c.json(listVariables(scope));
});

variableRoutes.get("/:key", (c) => {
  const value = getVariable(c.req.param("key"));
  if (value === null) return c.json({ error: "Variable not found" }, 404);
  return c.json({ key: c.req.param("key"), value });
});

variableRoutes.put("/:key", async (c) => {
  const body = await c.req.json();
  if (body.value === undefined) {
    return c.json({ error: "value is required" }, 400);
  }
  setVariable(c.req.param("key"), String(body.value), body.scope ?? "global");
  return c.json({ set: true });
});

variableRoutes.delete("/:key", (c) => {
  const deleted = deleteVariable(c.req.param("key"));
  if (!deleted) return c.json({ error: "Variable not found" }, 404);
  return c.json({ deleted: true });
});
