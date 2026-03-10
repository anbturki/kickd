import { registry } from "./registry";
import type { Task, TaskResult } from "../types";
import { readdir } from "fs/promises";
import { join } from "path";
import { config } from "../config";
import { logger } from "../logger";

const log = logger.child("loader");

export async function loadTasks() {
  const tasksDir = config.tasksDir;

  try {
    const files = await readdir(tasksDir);
    const taskFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of taskFiles) {
      const modulePath = join(tasksDir, file);
      try {
        const mod = await import(modulePath);
        if (mod.task && mod.handler) {
          registry.register(mod.task as Task, mod.handler as () => Promise<TaskResult>);
          log.info(`Loaded task: ${mod.task.name}`);
        }
      } catch (err) {
        log.error(`Failed to load task ${file}`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch {
    log.info("No tasks directory found, creating it...");
    await Bun.write(join(tasksDir, ".gitkeep"), "");
  }
}
