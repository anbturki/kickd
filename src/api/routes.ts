import { Hono } from "hono";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { askClaude } from "../bridge/claude";
import { webhookRoutes } from "./webhooks";
import { credentialRoutes } from "./credentials";
import * as db from "../db";
import { installPlugin, uninstallPlugin } from "../plugins";

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

api.get("/tasks/:id/history", (c) => {
  const limit = Number(c.req.query("limit") ?? "20");
  return c.json(registry.history(c.req.param("id"), limit));
});

api.get("/tasks/:id/stats", (c) => {
  const stats = registry.stats(c.req.param("id"));
  if (!stats) return c.json({ error: "No stats found" }, 404);
  return c.json(stats);
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

api.get("/skills/:id/history", (c) => {
  const limit = Number(c.req.query("limit") ?? "20");
  return c.json(skills.history(c.req.param("id"), limit));
});

api.post("/skills/chain", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body.steps)) {
    return c.json({ error: "steps array is required" }, 400);
  }
  const result = await skills.chain(body.steps);
  return c.json(result);
});

// ── Webhooks ──

api.route("/hooks", webhookRoutes);

// ── Credentials ──

api.route("/credentials", credentialRoutes);

// ── Events ──

api.get("/events", (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  return c.json(db.getEvents(limit, offset));
});

api.get("/events/rules", (c) => {
  return c.json(db.getAllEventRules());
});

api.post("/events/rules", async (c) => {
  const body = await c.req.json();

  if (!body.eventType || !body.actionType || !body.targetId) {
    return c.json({ error: "eventType, actionType, and targetId are required" }, 400);
  }

  if (!["run_task", "run_skill"].includes(body.actionType)) {
    return c.json({ error: "actionType must be run_task or run_skill" }, 400);
  }

  const id = crypto.randomUUID().slice(0, 8);
  db.createEventRule({
    id,
    eventType: body.eventType,
    sourceId: body.sourceId,
    actionType: body.actionType,
    targetId: body.targetId,
    actionInput: body.actionInput,
  });

  return c.json({ id }, 201);
});

api.delete("/events/rules/:id", (c) => {
  db.deleteEventRule(c.req.param("id"));
  return c.json({ deleted: true });
});

// ── Notifications ──

api.get("/notifications/channels", (c) => {
  return c.json(db.getAllChannels());
});

api.post("/notifications/channels", async (c) => {
  const body = await c.req.json();

  if (!body.type || !body.url || !body.events) {
    return c.json({ error: "type, url, and events array are required" }, 400);
  }

  if (!["slack", "discord", "webhook"].includes(body.type)) {
    return c.json({ error: "type must be slack, discord, or webhook" }, 400);
  }

  const id = crypto.randomUUID().slice(0, 8);
  db.createNotificationChannel({
    id,
    type: body.type,
    url: body.url,
    events: body.events,
  });

  return c.json({ id }, 201);
});

api.delete("/notifications/channels/:id", (c) => {
  db.deleteChannel(c.req.param("id"));
  return c.json({ deleted: true });
});

// ── Plugins ──

api.get("/plugins", (c) => {
  return c.json(db.getPlugins());
});

api.post("/plugins/install", async (c) => {
  const body = await c.req.json();
  if (!body.package) {
    return c.json({ error: "package name is required" }, 400);
  }
  const result = await installPlugin(body.package);
  return c.json(result, result.success ? 200 : 400);
});

api.post("/plugins/uninstall", async (c) => {
  const body = await c.req.json();
  if (!body.package) {
    return c.json({ error: "package name is required" }, 400);
  }
  const result = await uninstallPlugin(body.package);
  return c.json(result, result.success ? 200 : 400);
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

// ── Stats & Health ──

api.get("/stats", (c) => {
  return c.json(db.getGlobalStats());
});

api.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    tasks: registry.list().length,
    skills: skills.list().length,
  });
});
