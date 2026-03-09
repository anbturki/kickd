import { registry } from "./registry";
import type { Task, TaskResult } from "../types";
import { readdir } from "fs/promises";
import { join } from "path";
import { config } from "../config";

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
          console.log(`  Loaded task: ${mod.task.name}`);
        }
      } catch (err) {
        console.error(`  Failed to load task ${file}:`, err);
      }
    }
  } catch {
    console.log("  No tasks directory found, creating it...");
    await Bun.write(join(tasksDir, ".gitkeep"), "");
  }
}
