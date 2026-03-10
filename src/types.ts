import type { RetryConfig } from "./retry";

export interface Task {
  id: string;
  name: string;
  description: string;
  handler: string;
  schedule?: string; // interval ("1h"), daily ("at:09:00"), or cron ("0 9 * * MON-FRI")
  retry?: RetryConfig;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: "idle" | "running" | "completed" | "failed";
  result?: string;
}

export interface TaskResult {
  success: boolean;
  output: string;
  duration: number;
}

export interface AutomationConfig {
  port: number;
  tasksDir: string;
  logsDir: string;
  dbPath: string;
}

export interface ClaudeBridgeRequest {
  prompt: string;
  workingDir?: string;
  allowedTools?: string[];
}

export interface ClaudeBridgeResponse {
  success: boolean;
  output: string;
  exitCode: number;
}
