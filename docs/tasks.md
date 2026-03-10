# Tasks

Tasks are background jobs that run on a schedule or on demand. Drop a `.ts` file in the `tasks/` directory and kickd loads it automatically.

## Creating a task

Every task file must export two things:

- `task` — a `Task` object with metadata
- `handler` — an async function that returns a `TaskResult`

```ts
// tasks/cleanup.ts
import type { Task, TaskResult } from "../src/types";

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
| Cron | `0 9 * * MON-FRI` | Standard 5-field cron expression |

Full cron supports ranges (`1-5`), lists (`1,3,5`), steps (`*/15`), named days (`MON-FRI`), and named months (`JAN-DEC`).

Omit `schedule` to make the task manual-only (triggered via CLI, API, or MCP).

## Retry

Add retry with exponential backoff:

```ts
export const task: Task = {
  id: "flaky-api",
  name: "Flaky API Call",
  description: "Calls an unreliable API with retries",
  handler: "tasks/flaky-api.ts",
  schedule: "1h",
  retry: {
    maxAttempts: 3,      // try up to 3 times
    baseDelayMs: 1000,   // start with 1 second
    maxDelayMs: 30000,   // cap at 30 seconds
    backoffMultiplier: 2 // double delay each retry
  },
  enabled: true,
  status: "idle",
};
```

Retry adds 0-25% jitter to prevent thundering herd. Each retry attempt is logged in the database with its attempt number.

## Running tasks manually

```bash
# Via CLI
kickd run cleanup

# Via HTTP
curl -X POST http://localhost:7400/tasks/cleanup/run

# With parameters
curl -X POST http://localhost:7400/tasks/cleanup/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## Passing parameters

The `handler` receives an optional `params` object:

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
import { skills } from "../src/skills/engine";

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

## Task history and stats

```bash
# View run history
kickd history cleanup

# Via HTTP
curl http://localhost:7400/tasks/cleanup/history?limit=10
curl http://localhost:7400/tasks/cleanup/stats
```

Stats include total runs, success/failure counts, average duration, and last run time.

## Task status

Each task tracks its current state:

| Status | Meaning |
|--------|---------|
| `idle` | Not running, waiting for next trigger |
| `running` | Currently executing |
| `completed` | Last run succeeded |
| `failed` | Last run failed |

## Events

Tasks automatically emit events that can trigger other tasks or skills:

- `task.completed` — task finished successfully
- `task.failed` — task finished with an error
- `task.retry` — task is being retried

See [Events guide](./events.md) for setting up reactive rules.
