import { Hono } from "hono";
import { workflows } from "../workflows";
import type { WorkflowDefinition } from "../workflows";

export const workflowRoutes = new Hono();

workflowRoutes.get("/", (c) => {
  return c.json(workflows.list());
});

workflowRoutes.get("/:id", (c) => {
  const workflow = workflows.get(c.req.param("id"));
  if (!workflow) return c.json({ error: "Workflow not found" }, 404);
  return c.json(workflow);
});

workflowRoutes.post("/", async (c) => {
  const body = await c.req.json() as WorkflowDefinition;

  if (!body.id || !body.name || !body.steps || !body.startStep) {
    return c.json({ error: "id, name, steps, and startStep are required" }, 400);
  }

  workflows.register(body);
  return c.json({ registered: true, id: body.id }, 201);
});

workflowRoutes.post("/:id/run", async (c) => {
  const input = await c.req.json().catch(() => ({}));
  const result = await workflows.run(c.req.param("id"), input);
  return c.json(result, result.success ? 200 : 500);
});

workflowRoutes.delete("/:id", (c) => {
  workflows.unregister(c.req.param("id"));
  return c.json({ deleted: true });
});
