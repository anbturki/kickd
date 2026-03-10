import type { Task, TaskResult } from "../src/types";

export const task: Task = {
  id: "hello",
  name: "Hello World",
  description: "A simple example task that greets you",
  handler: "tasks/hello.ts",
  enabled: true,
  status: "idle",
};

export async function handler(): Promise<TaskResult> {
  const message = `Hello from kickd! Current time: ${new Date().toISOString()}`;
  console.log(message);
  return {
    success: true,
    output: message,
    duration: 0,
  };
}
