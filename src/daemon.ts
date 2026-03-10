import { Hono } from "hono";
import { api } from "./api/routes";
import { loadTasks } from "./tasks/loader";
import { loadSkills } from "./skills/loader";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { initEventRules } from "./events";
import { initNotifications } from "./notifications";
import { loadInstalledPlugins } from "./plugins";
import { registry } from "./tasks/registry";
import { skills } from "./skills/engine";
import { logger } from "./logger";
import { initGracefulShutdown } from "./lifecycle";

// Import db to ensure schema creation runs
import "./db";

const log = logger.child("daemon");

const app = new Hono();
app.use("*", rateLimitMiddleware());
app.use("*", authMiddleware);
app.route("/", api);

async function start() {
  initGracefulShutdown();

  log.info("kickd starting...");

  log.info("Loading skills...");
  await loadSkills();

  log.info("Loading plugins...");
  await loadInstalledPlugins();

  log.info("Loading tasks...", { dir: config.tasksDir });
  await loadTasks();

  log.info("Initializing event system...");
  initEventRules(
    (taskId, params) => registry.run(taskId, params),
    (skillId, input) => skills.run(skillId, input)
  );

  log.info("Initializing notifications...");
  initNotifications();

  Bun.serve({
    fetch: app.fetch,
    port: config.port,
  });

  log.info(`HTTP API listening on http://localhost:${config.port}`);
  if (process.env.KICKD_API_TOKEN) {
    log.info("Auth: enabled (bearer token)");
  } else {
    log.warn("Auth: disabled (set KICKD_API_TOKEN to enable)");
  }
  log.info("Ready.");
}

start();
