import type { Task, TaskResult } from "../types";
import { withRetry } from "../retry";
import { parseCron, nextOccurrence, isCronExpression } from "../cron";
import { startTaskRun, finishTaskRun, getTaskHistory, getTaskStats } from "../db";
import { eventBus } from "../events";
import { logger } from "../logger";

const log = logger.child("registry");

type TaskHandler = (params?: Record<string, unknown>) => Promise<TaskResult>;

class TaskRegistry {
  private tasks = new Map<string, Task>();
  private handlers = new Map<string, TaskHandler>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  register(task: Task, handler: TaskHandler) {
    this.tasks.set(task.id, task);
    this.handlers.set(task.id, handler);

    if (task.schedule && task.enabled) {
      this.schedule(task);
    }
  }

  private schedule(task: Task) {
    const schedule = task.schedule!;

    // "at:HH:MM" — daily at specific time
    const timeMatch = schedule.match(/^at:(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      this.scheduleDaily(task, Number(timeMatch[1]), Number(timeMatch[2]));
      return;
    }

    // Interval shorthand: "10s", "5m", "1h", "1d"
    const intervalMs = parseIntervalToMs(schedule);
    if (intervalMs > 0) {
      const timer = setInterval(() => {
        this.run(task.id);
      }, intervalMs);
      this.timers.set(task.id, timer as unknown as ReturnType<typeof setTimeout>);
      return;
    }

    // Full cron expression: "0 9 * * MON-FRI"
    if (isCronExpression(schedule)) {
      this.scheduleCron(task);
      return;
    }

    log.warn(`Unknown schedule format for ${task.id}: ${schedule}`);
  }

  private scheduleCron(task: Task) {
    const cronSchedule = parseCron(task.schedule!);

    const scheduleNext = () => {
      const next = nextOccurrence(cronSchedule);
      const delay = next.getTime() - Date.now();
      task.nextRun = next;

      const timer = setTimeout(async () => {
        await this.run(task.id);
        scheduleNext();
      }, delay);

      this.timers.set(task.id, timer);
    };

    scheduleNext();
  }

  private scheduleDaily(task: Task, hour: number, minute: number) {
    const scheduleNext = () => {
      const now = new Date();
      const target = new Date();
      target.setHours(hour, minute, 0, 0);

      if (now > target) {
        target.setDate(target.getDate() + 1);
      }

      const delay = target.getTime() - now.getTime();
      task.nextRun = target;

      const timer = setTimeout(async () => {
        await this.run(task.id);
        scheduleNext();
      }, delay);

      this.timers.set(task.id, timer);
    };

    scheduleNext();
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
    const runId = startTaskRun(taskId, params);

    try {
      let result: TaskResult;

      if (task.retry) {
        let attempt = 0;
        result = await withRetry(
          () => handler(params),
          task.retry,
          (retryAttempt, error, delayMs) => {
            attempt = retryAttempt;
            log.info(`Task ${taskId} retry #${retryAttempt}: ${error.message} (waiting ${Math.round(delayMs)}ms)`);

            // Log retry attempt
            finishTaskRun(runId, "failed", error.message, performance.now() - start);
            startTaskRun(taskId, params, retryAttempt);

            eventBus.emit({
              type: "task.retry",
              sourceType: "task",
              sourceId: taskId,
              payload: { attempt: retryAttempt, error: error.message, delayMs },
            });
          }
        );
      } else {
        result = await handler(params);
      }

      task.status = result.success ? "completed" : "failed";
      task.result = result.output;
      result.duration = performance.now() - start;

      finishTaskRun(runId, result.success ? "completed" : "failed", result.output, result.duration);

      eventBus.emit({
        type: result.success ? "task.completed" : "task.failed",
        sourceType: "task",
        sourceId: taskId,
        payload: { output: result.output, duration: result.duration },
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      task.status = "failed";
      const output = error instanceof Error ? error.message : String(error);
      task.result = output;

      finishTaskRun(runId, "failed", output, duration);

      eventBus.emit({
        type: "task.failed",
        sourceType: "task",
        sourceId: taskId,
        payload: { error: output, duration },
      });

      return { success: false, output, duration };
    }
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  history(taskId: string, limit = 20) {
    return getTaskHistory(taskId, limit);
  }

  stats(taskId: string) {
    return getTaskStats(taskId);
  }

  unregister(taskId: string) {
    const timer = this.timers.get(taskId);
    if (timer) clearTimeout(timer);
    this.timers.delete(taskId);
    this.tasks.delete(taskId);
    this.handlers.delete(taskId);
  }

  stopAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

function parseIntervalToMs(schedule: string): number {
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
