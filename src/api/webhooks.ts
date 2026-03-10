import { Hono } from "hono";
import { createHmac } from "crypto";
import * as db from "../db";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { eventBus } from "../events";

export const webhookRoutes = new Hono();

// List all webhooks
webhookRoutes.get("/", (c) => {
  return c.json(db.getWebhooks());
});

// Create a webhook
webhookRoutes.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name || !body.targetType || !body.targetId) {
    return c.json({ error: "name, targetType, and targetId are required" }, 400);
  }

  if (!["task", "skill", "chain"].includes(body.targetType)) {
    return c.json({ error: "targetType must be task, skill, or chain" }, 400);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const secret = body.secret ?? crypto.randomUUID();

  db.createWebhook({
    id,
    name: body.name,
    targetType: body.targetType,
    targetId: body.targetId,
    secret,
  });

  return c.json({ id, secret, url: `/hooks/${id}` }, 201);
});

// Delete a webhook
webhookRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const webhook = db.getWebhook(id);
  if (!webhook) return c.json({ error: "Webhook not found" }, 404);

  db.deleteWebhook(id);
  return c.json({ deleted: true });
});

// Trigger a webhook
webhookRoutes.post("/:id", async (c) => {
  const id = c.req.param("id");
  const webhook = db.getWebhook(id);

  if (!webhook || !webhook.enabled) {
    return c.json({ error: "Webhook not found or disabled" }, 404);
  }

  // Validate HMAC if secret is set
  if (webhook.secret) {
    const signature = c.req.header("X-Kickd-Signature");
    if (signature) {
      const rawBody = await c.req.text();
      const expected = createHmac("sha256", webhook.secret).update(rawBody).digest("hex");
      if (signature !== expected) {
        return c.json({ error: "Invalid signature" }, 403);
      }
    }
  }

  const body = await c.req.json().catch(() => ({}));

  eventBus.emit({
    type: "webhook.triggered",
    sourceType: "webhook",
    sourceId: id,
    payload: { webhookName: webhook.name, targetType: webhook.target_type, targetId: webhook.target_id },
  });

  switch (webhook.target_type) {
    case "task": {
      const result = await registry.run(webhook.target_id, body);
      return c.json(result);
    }
    case "skill": {
      const result = await skills.run(webhook.target_id, body);
      return c.json(result);
    }
    case "chain": {
      if (!Array.isArray(body.steps)) {
        return c.json({ error: "Chain webhook requires steps array in body" }, 400);
      }
      const result = await skills.chain(body.steps);
      return c.json(result);
    }
    default:
      return c.json({ error: "Unknown target type" }, 400);
  }
});
