# kickd

Background automation daemon with a built-in skill engine, task scheduler, HTTP API, CLI, and MCP server for Claude Code integration.

Run tasks on a schedule, chain composable skills together, and communicate bidirectionally with Claude Code.

## Features

- **Task scheduler** — run tasks on intervals (`1h`, `30m`) or daily at a specific time (`at:09:00`)
- **Skill engine** — composable, chainable units of work with typed inputs/outputs (via Zod)
- **MCP server** — expose tasks and skills as tools that Claude Code can call directly
- **Claude Code bridge** — call Claude Code CLI from your automations
- **HTTP API** — manage tasks, skills, and the daemon over HTTP
- **CLI** — interact with the running daemon from the terminal

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (optional, for the Claude bridge)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/anbturki/kickd.git
cd kickd

# Install dependencies
bun install

# Start the daemon
bun run start
```

The daemon starts on port `7400` by default. Verify with:

```bash
curl http://localhost:7400/health
```

## Usage

### CLI

The CLI talks to the running daemon over HTTP.

```bash
# List all tasks
bun run cli list

# List all skills
bun run cli skills

# Run a task
bun run cli run hello

# Run a skill with JSON input
bun run cli skill generate-content '{"platform":"linkedin","topics":["developer productivity"]}'

# Ask Claude Code a question
bun run cli ask "What files are in this directory?"

# Check daemon health
bun run cli health
```

### HTTP API

All endpoints are available at `http://localhost:7400`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Daemon status, uptime, task/skill counts |
| `GET` | `/tasks` | List all registered tasks |
| `GET` | `/tasks/:id` | Get a specific task |
| `POST` | `/tasks/:id/run` | Run a task (accepts JSON body with params) |
| `GET` | `/skills` | List all registered skills |
| `POST` | `/skills/:id/run` | Run a skill (accepts JSON body with input) |
| `POST` | `/skills/chain` | Chain skills (accepts `{ steps: [...] }`) |
| `POST` | `/claude` | Send a prompt to Claude Code CLI |

### MCP Server (Claude Code Integration)

kickd includes an MCP server so Claude Code can call your tasks and skills directly.

Add this to your Claude Code MCP config (`~/.claude.json` or project `.mcp.json`):

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

Once connected, Claude Code gets these tools:

| Tool | Description |
|------|-------------|
| `list_automations` | List all tasks and skills |
| `run_automation` | Run a task by ID |
| `run_skill` | Run a skill with input |
| `chain_skills` | Chain multiple skills in sequence |
| `run_command` | Execute a shell command |
| `ask_claude` | Send a prompt to Claude Code CLI |

## Adding Tasks

Create a file in `tasks/` that exports `task` (metadata) and `handler` (async function).

```ts
// tasks/my-task.ts
import type { Task, TaskResult } from "../src/types";

export const task: Task = {
  id: "my-task",
  name: "My Task",
  description: "Does something useful",
  handler: "tasks/my-task.ts",
  schedule: "1h",       // run every hour
  // schedule: "at:09:00", // or daily at 9:00 AM
  enabled: true,
  status: "idle",
};

export async function handler(params?: Record<string, unknown>): Promise<TaskResult> {
  return {
    success: true,
    output: "Task completed",
    duration: 0,
  };
}
```

### Schedule formats

| Format | Example | Description |
|--------|---------|-------------|
| `Ns` | `30s` | Every N seconds |
| `Nm` | `5m` | Every N minutes |
| `Nh` | `1h` | Every N hours |
| `Nd` | `1d` | Every N days |
| `at:HH:MM` | `at:09:00` | Daily at specific time (local timezone) |

## Adding Skills

Skills are composable building blocks with typed inputs and outputs. Create a file in `skills/` — they self-register on import.

```ts
// skills/my-skill.ts
import { z } from "zod";
import { skills } from "../src/skills/engine";

skills.register({
  id: "my-skill",
  name: "My Skill",
  description: "A composable unit of work",
  input: z.object({
    message: z.string().describe("Input message"),
  }),
  output: z.object({
    result: z.string(),
  }),
  execute: async (input) => {
    return { result: `Processed: ${input.message}` };
  },
});
```

### Chaining skills

Skills can be chained via the HTTP API or MCP. The output of one skill feeds into the next:

```bash
curl -X POST http://localhost:7400/skills/chain \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      { "skillId": "generate-content", "input": {"platform": "linkedin", "topics": ["AI"]} },
      { "skillId": "post-linkedin" }
    ]
  }'
```

Tasks can also chain skills programmatically:

```ts
const generated = await skills.run("generate-content", { platform: "linkedin", topics: ["AI"] });
const posted = await skills.run("post-linkedin", { content: generated.output.content });
```

## Included Examples

### Tasks
| Task | Schedule | Description |
|------|----------|-------------|
| `hello` | manual | Simple hello world example |
| `disk-usage` | every 1h | Reports home directory disk usage |
| `linkedin-post` | daily at 09:00 | Generates and posts content to LinkedIn |

### Skills
| Skill | Description |
|-------|-------------|
| `generate-content` | Generates social media content using Claude Code CLI |
| `post-linkedin` | Publishes a text post to the LinkedIn API |

## Configuration

### Environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMATION_PORT` | `7400` | HTTP API port |
| `LINKEDIN_ACCESS_TOKEN` | — | LinkedIn OAuth access token |
| `LINKEDIN_PERSON_URN` | — | Your LinkedIn person URN (e.g. `urn:li:person:abc123`) |
| `LINKEDIN_CLIENT_ID` | — | LinkedIn app client ID (for token refresh) |
| `LINKEDIN_CLIENT_SECRET` | — | LinkedIn app client secret (for token refresh) |
| `LINKEDIN_REFRESH_TOKEN` | — | LinkedIn refresh token (for token refresh) |

### LinkedIn API Setup

1. Create an app at [developer.linkedin.com](https://developer.linkedin.com/)
2. Request the **Share on LinkedIn** product (grants `w_member_social` scope)
3. Generate an access token with `w_member_social` scope
4. Find your Person URN via the LinkedIn API: `GET https://api.linkedin.com/v2/userinfo`
5. Add credentials to your `.env` file

## Running in the Background

### Using launchd (macOS)

Create `~/Library/LaunchAgents/com.kickd.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kickd.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/bun</string>
        <string>run</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/kickd</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.kickd.daemon.plist
```

### Using pm2

```bash
pm2 start "bun run start" --name kickd
pm2 save
```

## Architecture

```
┌──────────────┐    MCP (stdio)    ┌───────────────────────────┐
│  Claude Code │ ────────────────► │                           │
│              │ ◄──────────────── │        kickd daemon       │
└──────────────┘                   │                           │
                                   │  ┌─────────┐ ┌────────┐  │
┌──────────────┐    HTTP :7400     │  │  Tasks   │ │ Skills │  │
│   You (CLI)  │ ────────────────► │  │ Registry │ │ Engine │  │
│              │ ◄──────────────── │  └─────────┘ └────────┘  │
└──────────────┘                   │                           │
                                   │  ┌─────────────────────┐  │
┌──────────────┐    claude CLI     │  │   Claude Bridge     │  │
│  Claude Code │ ◄──────────────── │  │   (subprocess)      │  │
│     CLI      │                   │  └─────────────────────┘  │
└──────────────┘                   └───────────────────────────┘
```

## License

MIT
