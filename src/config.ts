import type { AutomationConfig } from "./types";
import { join } from "path";

const ROOT = import.meta.dir;

export const config: AutomationConfig = {
  port: Number(process.env.KICKD_PORT ?? 7400),
  tasksDir: join(ROOT, "..", "tasks"),
  logsDir: join(ROOT, "..", "logs"),
  dbPath: join(ROOT, "..", "data", "kickd.db"),
};
