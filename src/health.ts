import { db } from "./db";
import { registry } from "./tasks/registry";
import { skills } from "./skills/engine";
import { taskQueue } from "./queue";

export interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  latencyMs?: number;
}

export interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  checks: HealthCheck[];
  timestamp: string;
}

export async function getHealthReport(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  // Database health
  const dbStart = performance.now();
  try {
    db.prepare("SELECT 1").get();
    checks.push({
      name: "database",
      status: "healthy",
      latencyMs: performance.now() - dbStart,
    });
  } catch (err) {
    checks.push({
      name: "database",
      status: "unhealthy",
      message: err instanceof Error ? err.message : String(err),
      latencyMs: performance.now() - dbStart,
    });
  }

  // Task registry
  const tasks = registry.list();
  const failedTasks = tasks.filter((t) => t.status === "failed");
  checks.push({
    name: "tasks",
    status: failedTasks.length > tasks.length / 2 ? "degraded" : "healthy",
    message: `${tasks.length} registered, ${failedTasks.length} failed`,
  });

  // Skills
  const skillList = skills.list();
  checks.push({
    name: "skills",
    status: "healthy",
    message: `${skillList.length} registered`,
  });

  // Queue
  const queueStats = taskQueue.stats();
  checks.push({
    name: "queue",
    status: queueStats.pending > queueStats.maxSize * 0.9 ? "degraded" : "healthy",
    message: `${queueStats.active} active, ${queueStats.pending} pending`,
  });

  // Memory
  const mem = process.memoryUsage();
  const rssMB = mem.rss / 1024 / 1024;
  checks.push({
    name: "memory",
    status: rssMB > 512 ? "degraded" : "healthy",
    message: `${Math.round(rssMB)}MB RSS, ${Math.round(mem.heapUsed / 1024 / 1024)}MB heap used`,
  });

  // Overall status
  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overallStatus = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

  return {
    status: overallStatus,
    uptime: process.uptime(),
    checks,
    timestamp: new Date().toISOString(),
  };
}
