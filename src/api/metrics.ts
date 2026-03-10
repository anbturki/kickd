import { Hono } from "hono";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { getGlobalStats } from "../db";

export const metricsRoutes = new Hono();

// Prometheus-compatible /metrics endpoint
metricsRoutes.get("/", (c) => {
  const stats = getGlobalStats();
  const tasks = registry.list();
  const skillList = skills.list();
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  const lines: string[] = [
    "# HELP kickd_uptime_seconds Daemon uptime in seconds",
    "# TYPE kickd_uptime_seconds gauge",
    `kickd_uptime_seconds ${uptime.toFixed(2)}`,
    "",
    "# HELP kickd_task_runs_total Total number of task runs",
    "# TYPE kickd_task_runs_total counter",
    `kickd_task_runs_total{status="success"} ${stats.task_successes}`,
    `kickd_task_runs_total{status="failure"} ${stats.task_failures}`,
    "",
    "# HELP kickd_skill_runs_total Total number of skill runs",
    "# TYPE kickd_skill_runs_total counter",
    `kickd_skill_runs_total{status="success"} ${stats.skill_successes}`,
    `kickd_skill_runs_total{status="failure"} ${stats.skill_failures}`,
    "",
    "# HELP kickd_events_total Total number of events logged",
    "# TYPE kickd_events_total counter",
    `kickd_events_total ${stats.total_events}`,
    "",
    "# HELP kickd_webhooks_active Number of active webhooks",
    "# TYPE kickd_webhooks_active gauge",
    `kickd_webhooks_active ${stats.active_webhooks}`,
    "",
    "# HELP kickd_tasks_registered Number of registered tasks",
    "# TYPE kickd_tasks_registered gauge",
    `kickd_tasks_registered ${tasks.length}`,
    "",
    "# HELP kickd_skills_registered Number of registered skills",
    "# TYPE kickd_skills_registered gauge",
    `kickd_skills_registered ${skillList.length}`,
    "",
    "# HELP kickd_memory_rss_bytes Resident set size in bytes",
    "# TYPE kickd_memory_rss_bytes gauge",
    `kickd_memory_rss_bytes ${mem.rss}`,
    "",
    "# HELP kickd_memory_heap_used_bytes Heap used in bytes",
    "# TYPE kickd_memory_heap_used_bytes gauge",
    `kickd_memory_heap_used_bytes ${mem.heapUsed}`,
    "",
  ];

  // Per-task status
  lines.push("# HELP kickd_task_status Current status of each task (1=active)");
  lines.push("# TYPE kickd_task_status gauge");
  for (const task of tasks) {
    const statuses = ["idle", "running", "completed", "failed"];
    for (const s of statuses) {
      lines.push(`kickd_task_status{task="${task.id}",status="${s}"} ${task.status === s ? 1 : 0}`);
    }
  }

  lines.push("");

  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(lines.join("\n"));
});
