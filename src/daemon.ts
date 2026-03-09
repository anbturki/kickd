import { Hono } from "hono";
import { logger } from "hono/logger";
import { api } from "./api/routes";
import { loadTasks } from "./tasks/loader";
import { loadSkills } from "./skills/loader";
import { config } from "./config";

const app = new Hono();
app.use("*", logger());
app.route("/", api);

async function start() {
  console.log("Automation Daemon starting...");

  console.log("  Loading skills...");
  await loadSkills();

  console.log(`  Loading tasks from ${config.tasksDir}`);
  await loadTasks();

  Bun.serve({
    fetch: app.fetch,
    port: config.port,
  });

  console.log(`  HTTP API listening on http://localhost:${config.port}`);
  console.log("  Ready.\n");
}

start();
