import type { Task, TaskResult } from "../src/types";

export const task: Task = {
  id: "disk-usage",
  name: "Disk Usage Check",
  description: "Reports disk usage for the home directory",
  handler: "tasks/disk-usage.ts",
  schedule: "1h",
  enabled: true,
  status: "idle",
};

export async function handler(): Promise<TaskResult> {
  const proc = Bun.spawn(["du", "-sh", process.env.HOME ?? "/Users"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    output: output.trim(),
    duration: 0,
  };
}
