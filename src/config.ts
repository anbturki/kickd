import type { AutomationConfig } from "./types";
import { join } from "path";

const ROOT = import.meta.dir;

export const config: AutomationConfig = {
  port: Number(process.env.AUTOMATION_PORT ?? 7400),
  mcpPort: Number(process.env.AUTOMATION_MCP_PORT ?? 7401),
  tasksDir: join(ROOT, "..", "tasks"),
  logsDir: join(ROOT, "..", "logs"),
};
