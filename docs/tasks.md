# Tasks

Tasks are background jobs that run on a schedule or on demand. Drop a `.ts` file in the `tasks/` directory and kickd loads it automatically.

## Creating a task

Every task file must export two things:

- `task` — a `Task` object with metadata
- `handler` — an async function that returns a `TaskResult`

```ts
// tasks/cleanup.ts
import type { Task, TaskResult } from "kickd/types";

export const task: Task = {
  id: "cleanup",
  name: "Cleanup Temp Files",
  description: "Removes old temp files",
  handler: "tasks/cleanup.ts",
  schedule: "1d",
  enabled: true,
  status: "idle",
};

export async function handler(params?: Record<string, unknown>): Promise<TaskResult> {
  // your logic here
  return { success: true, output: "Cleaned up 42 files", duration: 0 };
}
```

## Schedule formats

| Format | Example | Meaning |
|--------|---------|---------|
| `Ns` | `30s` | Every 30 seconds |
| `Nm` | `5m` | Every 5 minutes |
| `Nh` | `1h` | Every hour |
| `Nd` | `1d` | Every day |
| `at:HH:MM` | `at:09:00` | Daily at 9:00 AM (local time) |

Omit `schedule` to make the task manual-only (triggered via CLI, API, or MCP).

## Running tasks manually

```bash
# Via CLI
bun run cli run cleanup

# Via HTTP
curl -X POST http://localhost:7400/tasks/cleanup/run

# With parameters
curl -X POST http://localhost:7400/tasks/cleanup/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## Passing parameters

The `handler` receives an optional `params` object. You can pass parameters when running a task manually:

```ts
export async function handler(params?: Record<string, unknown>): Promise<TaskResult> {
  const dryRun = params?.dryRun === true;
  const target = (params?.target as string) ?? "/tmp";

  if (dryRun) {
    return { success: true, output: `Would clean ${target}`, duration: 0 };
  }

  // actual cleanup...
  return { success: true, output: `Cleaned ${target}`, duration: 0 };
}
```

## Using skills inside tasks

Tasks can call skills for composable logic:

```ts
import { skills } from "kickd/skills";

export async function handler(): Promise<TaskResult> {
  const result = await skills.run("generate-content", {
    platform: "linkedin",
    topics: ["tech"],
  });

  if (!result.success) {
    return { success: false, output: result.error ?? "Failed", duration: 0 };
  }

  return { success: true, output: JSON.stringify(result.output), duration: 0 };
}
```

## Task status

Each task tracks its current state:

| Status | Meaning |
|--------|---------|
| `idle` | Not running, waiting for next trigger |
| `running` | Currently executing |
| `completed` | Last run succeeded |
| `failed` | Last run failed |

Check status via `GET /tasks/:id` or `bun run cli list`.
