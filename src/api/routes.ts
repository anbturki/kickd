import { Hono } from "hono";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { askClaude } from "../bridge/claude";

export const api = new Hono();

// ── Tasks ──

api.get("/tasks", (c) => {
  return c.json(registry.list());
});

api.get("/tasks/:id", (c) => {
  const task = registry.get(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});

api.post("/tasks/:id/run", async (c) => {
  const params = await c.req.json().catch(() => ({}));
  const result = await registry.run(c.req.param("id"), params);
  return c.json(result);
});

// ── Skills ──

api.get("/skills", (c) => {
  return c.json(skills.list());
});

api.post("/skills/:id/run", async (c) => {
  const input = await c.req.json().catch(() => ({}));
  const result = await skills.run(c.req.param("id"), input);
  return c.json(result);
});

// Chain skills: POST /skills/chain { steps: [{ skillId, input? }] }
api.post("/skills/chain", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body.steps)) {
    return c.json({ error: "steps array is required" }, 400);
  }
  const result = await skills.chain(body.steps);
  return c.json(result);
});

// ── Claude Bridge ──

api.post("/claude", async (c) => {
  const body = await c.req.json();
  if (!body.prompt) return c.json({ error: "prompt is required" }, 400);

  const result = await askClaude({
    prompt: body.prompt,
    workingDir: body.workingDir,
    allowedTools: body.allowedTools,
  });

  return c.json(result);
});

// ── Health ──

api.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    tasks: registry.list().length,
    skills: skills.list().length,
  });
});
