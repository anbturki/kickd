import type { Task, TaskResult } from "../types";

type TaskHandler = (params?: Record<string, unknown>) => Promise<TaskResult>;

class TaskRegistry {
  private tasks = new Map<string, Task>();
  private handlers = new Map<string, TaskHandler>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();

  register(task: Task, handler: TaskHandler) {
    this.tasks.set(task.id, task);
    this.handlers.set(task.id, handler);

    if (task.schedule && task.enabled) {
      this.scheduleCron(task);
    }
  }

  private scheduleCron(task: Task) {
    const schedule = task.schedule!;

    // Support "at:HH:MM" for daily at specific time
    const timeMatch = schedule.match(/^at:(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      this.scheduleDaily(task, Number(timeMatch[1]), Number(timeMatch[2]));
      return;
    }

    // Interval-based: "10s", "1m", "1h", "1d"
    const intervalMs = parseCronToMs(schedule);
    if (intervalMs <= 0) return;

    const interval = setInterval(() => {
      this.run(task.id);
    }, intervalMs);

    this.intervals.set(task.id, interval);
  }

  private scheduleDaily(task: Task, hour: number, minute: number) {
    const check = () => {
      const now = new Date();
      const target = new Date();
      target.setHours(hour, minute, 0, 0);

      // If target time already passed today, schedule for tomorrow
      if (now > target) {
        target.setDate(target.getDate() + 1);
      }

      const delay = target.getTime() - now.getTime();
      task.nextRun = target;

      const timeout = setTimeout(async () => {
        await this.run(task.id);
        // Reschedule for next day
        check();
      }, delay);

      this.intervals.set(task.id, timeout as unknown as ReturnType<typeof setInterval>);
    };

    check();
  }

  async run(taskId: string, params?: Record<string, unknown>): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    const handler = this.handlers.get(taskId);

    if (!task || !handler) {
      return { success: false, output: `Task "${taskId}" not found`, duration: 0 };
    }

    task.status = "running";
    task.lastRun = new Date();
    const start = performance.now();

    try {
      const result = await handler(params);
      task.status = result.success ? "completed" : "failed";
      task.result = result.output;
      result.duration = performance.now() - start;
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      task.status = "failed";
      const output = error instanceof Error ? error.message : String(error);
      task.result = output;
      return { success: false, output, duration };
    }
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  unregister(taskId: string) {
    const interval = this.intervals.get(taskId);
    if (interval) clearInterval(interval);
    this.intervals.delete(taskId);
    this.tasks.delete(taskId);
    this.handlers.delete(taskId);
  }

  stopAll() {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

function parseCronToMs(schedule: string): number {
  // Supports: "10s", "30s", "1m", "5m", "1h", "1d"
  const match = schedule.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60_000;
    case "h": return value * 3_600_000;
    case "d": return value * 86_400_000;
    default: return 0;
  }
}

export const registry = new TaskRegistry();
