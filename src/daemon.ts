import { Hono } from "hono";
import { logger } from "hono/logger";
import { api } from "./api/routes";
import { loadTasks } from "./tasks/loader";
import { loadSkills } from "./skills/loader";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth";
import { initEventRules } from "./events";
import { initNotifications } from "./notifications";
import { loadInstalledPlugins } from "./plugins";
import { registry } from "./tasks/registry";
import { skills } from "./skills/engine";

// Import db to ensure schema creation runs
import "./db";

const app = new Hono();
app.use("*", logger());
app.use("*", authMiddleware);
app.route("/", api);

async function start() {
  console.log("kickd starting...\n");

  console.log("  Loading skills...");
  await loadSkills();

  console.log("  Loading plugins...");
  await loadInstalledPlugins();

  console.log(`  Loading tasks from ${config.tasksDir}`);
  await loadTasks();

  console.log("  Initializing event system...");
  initEventRules(
    (taskId, params) => registry.run(taskId, params),
    (skillId, input) => skills.run(skillId, input)
  );

  console.log("  Initializing notifications...");
  initNotifications();

  Bun.serve({
    fetch: app.fetch,
    port: config.port,
  });

  console.log(`\n  HTTP API listening on http://localhost:${config.port}`);
  if (process.env.KICKD_API_TOKEN) {
    console.log("  Auth: enabled (bearer token)");
  } else {
    console.log("  Auth: disabled (set KICKD_API_TOKEN to enable)");
  }
  console.log("  Ready.\n");
}

start();
