# Getting Started

## Install

```bash
git clone https://github.com/anbturki/kickd.git
cd kickd
bun install
```

## 1. Start the daemon

```bash
bun run start
```

The daemon is now running on `http://localhost:7400`.

Check health:

```bash
curl http://localhost:7400/health
```

## 2. Create your first task

Create a file called `tasks/greet.ts`:

```ts
import type { Task, TaskResult } from "../src/types";

export const task: Task = {
  id: "greet",
  name: "Greeting",
  description: "Says hello every 30 minutes",
  handler: "tasks/greet.ts",
  schedule: "30m",
  enabled: true,
  status: "idle",
};

export async function handler(): Promise<TaskResult> {
  console.log("Hello from kickd!");
  return { success: true, output: "Greeted!", duration: 0 };
}
```

Restart the daemon and your task will auto-load and run every 30 minutes.

Run it manually:

```bash
kickd run greet
# or
curl -X POST http://localhost:7400/tasks/greet/run
```

## 3. Create your first skill

Create a file called `skills/uppercase.ts`:

```ts
import { z } from "zod";
import { skills } from "../src/skills/engine";

skills.register({
  id: "uppercase",
  name: "Uppercase",
  description: "Converts text to uppercase",
  input: z.object({ text: z.string() }),
  output: z.object({ result: z.string() }),
  execute: async (input) => {
    return { result: input.text.toUpperCase() };
  },
});
```

Run it:

```bash
kickd skill uppercase '{"text": "hello world"}'
# or
curl -X POST http://localhost:7400/skills/uppercase/run \
  -H "Content-Type: application/json" \
  -d '{"text": "hello world"}'
```

## 4. Set a variable

Variables persist across restarts and can be used in workflow templates:

```bash
kickd vars set greeting "Hello World"
kickd vars get greeting
```

## 5. Connect to Claude Code (optional)

Add to your `~/.claude.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "kickd": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/kickd"
    }
  }
}
```

Now you can tell Claude Code: *"run my greet task"* or *"run the uppercase skill with text hello"*.

## 6. Secure with auth (optional)

Set a bearer token in `.env`:

```bash
KICKD_API_TOKEN=your-secret-token
```

All API requests now require `Authorization: Bearer your-secret-token`. The CLI reads this from the same env var automatically.

## Next steps

- [Tasks guide](./tasks.md) — scheduling, retry, parameters
- [Skills guide](./skills.md) — composing, chaining, input/output schemas
- [Workflows guide](./workflows.md) — multi-step pipelines with conditions and parallel execution
- [Credentials guide](./credentials.md) — encrypted credential vault
- [Events guide](./events.md) — reactive rules and notifications
- [API reference](./api.md) — all HTTP endpoints
- [MCP integration](./mcp.md) — Claude Code setup and available tools
