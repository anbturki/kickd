# Getting Started

## Install

```bash
bun add kickd
```

## 1. Start the daemon

```bash
bunx kickd start
```

That's it. The daemon is now running on `http://localhost:7400`.

## 2. Create your first task

Create a file called `tasks/greet.ts`:

```ts
import type { Task, TaskResult } from "kickd/types";

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

## 3. Create your first skill

Create a file called `skills/uppercase.ts`:

```ts
import { z } from "zod";
import { skills } from "kickd/skills";

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
curl -X POST http://localhost:7400/skills/uppercase/run \
  -H "Content-Type: application/json" \
  -d '{"text": "hello world"}'
```

## 4. Connect to Claude Code (optional)

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "kickd": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Now you can tell Claude Code: *"run my greet task"* or *"run the uppercase skill with text hello"*.

## Next steps

- [Tasks guide](./tasks.md) — scheduling, parameters, examples
- [Skills guide](./skills.md) — composing, chaining, input/output schemas
- [API reference](./api.md) — all HTTP endpoints
- [MCP integration](./mcp.md) — Claude Code setup and available tools
