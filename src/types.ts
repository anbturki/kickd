export interface Task {
  id: string;
  name: string;
  description: string;
  handler: string; // module path to the handler
  schedule?: string; // cron expression
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
  mcpPort: number;
  tasksDir: string;
  logsDir: string;
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
