import { Hono } from "hono";
import { taskQueue } from "../queue";

export const queueRoutes = new Hono();

queueRoutes.get("/stats", (c) => {
  return c.json(taskQueue.stats());
});

queueRoutes.post("/clear", (c) => {
  taskQueue.clear();
  return c.json({ cleared: true });
});
