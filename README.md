# kickd

Background automation daemon with task scheduling, composable skills, credential vault, event system, webhook triggers, notifications, plugin ecosystem, and bidirectional Claude Code integration via MCP.

## Features

- **Task scheduler** — intervals (`1h`, `30m`), daily at time (`at:09:00`), or full cron (`0 9 * * MON-FRI`)
- **Skill engine** — composable, chainable units of work with Zod-validated inputs/outputs
- **Credential vault** — encrypted credential storage with 14+ built-in types (GitHub, Slack, AWS, Stripe, etc.)
- **Event system** — reactive rules: "when task X completes, run skill Y"
- **Webhook triggers** — trigger tasks/skills via HTTP webhooks with HMAC signing
- **Notifications** — Slack, Discord, or generic webhook alerts on task success/failure
- **Retry with backoff** — configurable retry with exponential backoff and jitter
- **SQLite persistence** — all task runs, skill executions, and events logged and queryable
- **MCP server** — expose everything as tools Claude Code can call directly
- **Claude Code bridge** — call Claude Code CLI from your automations
- **Plugin system** — install skills from npm (`kickd install <package>`)
- **HTTP API** — full REST API for all operations
- **CLI** — manage the daemon from the terminal
- **Auth** — optional bearer token authentication

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (optional, for the Claude bridge)

## Quick Start

```bash
git clone https://github.com/anbturki/kickd.git
cd kickd
bun install
bun run start
```

Verify: `curl http://localhost:7400/health`

## CLI Reference

```bash
# Tasks
kickd list                              # List all tasks
kickd run <id> [json]                   # Run a task
kickd history <id>                      # Task run history

# Skills
kickd skills                            # List all skills
kickd skill <id> [json]                 # Run a skill

# Credentials
kickd creds list                        # List stored credentials
kickd creds types                       # List available types (github, slack, aws, ...)
kickd creds add <name> <type> <json>    # Store a credential (encrypted)
kickd creds get <name>                  # View credential (sensitive values redacted)
kickd creds test <name>                 # Test connectivity
kickd creds delete <name>              # Delete a credential

# Webhooks
kickd webhook list                      # List webhooks
kickd webhook create <name> task:<id>   # Create a webhook
kickd webhook delete <id>               # Delete a webhook

# Events
kickd events                            # Show recent events
kickd events rules                      # List reactive rules
kickd events add <event> run_task:<id>  # Add a rule

# Notifications
kickd notify add slack <url>            # Add Slack notifications
kickd notify add discord <url>          # Add Discord notifications

# Plugins
kickd install <package>                 # Install a plugin from npm
kickd plugins                           # List installed plugins

# Other
kickd stats                             # Global statistics
kickd health                            # Daemon status
kickd ask "prompt"                      # Ask Claude Code
```

## HTTP API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Daemon status |
| `GET` | `/stats` | Global statistics |
| `GET` | `/tasks` | List tasks |
| `POST` | `/tasks/:id/run` | Run a task |
| `GET` | `/tasks/:id/history` | Task run history |
| `GET` | `/skills` | List skills |
| `POST` | `/skills/:id/run` | Run a skill |
| `POST` | `/skills/chain` | Chain skills |
| `GET` | `/credentials` | List credentials (redacted) |
| `POST` | `/credentials` | Store a credential |
| `GET` | `/credentials/types` | List credential types |
| `POST` | `/credentials/:id/test` | Test credential |
| `GET` | `/hooks` | List webhooks |
| `POST` | `/hooks` | Create webhook |
| `POST` | `/hooks/:id` | Trigger webhook |
| `GET` | `/events` | Event log |
| `GET` | `/events/rules` | List event rules |
| `POST` | `/events/rules` | Create event rule |
| `GET` | `/notifications/channels` | List notification channels |
| `POST` | `/notifications/channels` | Add notification channel |
| `GET` | `/plugins` | List installed plugins |
| `POST` | `/plugins/install` | Install plugin |
| `POST` | `/claude` | Send prompt to Claude Code |

## MCP Server (Claude Code)

Add to `~/.claude.json` or project `.mcp.json`:

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

Available MCP tools: `list_automations`, `run_automation`, `run_skill`, `chain_skills`, `list_credentials`, `store_credential`, `test_credential`, `list_credential_types`, `list_webhooks`, `create_webhook`, `list_event_rules`, `create_event_rule`, `get_task_history`, `get_stats`, `run_command`, `ask_claude`.

## Adding Tasks

```ts
// tasks/my-task.ts
import type { Task, TaskResult } from "../src/types";

export const task: Task = {
  id: "my-task",
  name: "My Task",
  description: "Does something useful",
  handler: "tasks/my-task.ts",
  schedule: "0 9 * * MON-FRI", // weekdays at 9am (full cron)
  retry: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2 },
  enabled: true,
  status: "idle",
};

export async function handler(params?: Record<string, unknown>): Promise<TaskResult> {
  return { success: true, output: "Done", duration: 0 };
}
```

### Schedule formats

| Format | Example | Description |
|--------|---------|-------------|
| `Ns` | `30s` | Every N seconds |
| `Nm` | `5m` | Every N minutes |
| `Nh` | `1h` | Every N hours |
| `Nd` | `1d` | Every N days |
| `at:HH:MM` | `at:09:00` | Daily at specific time |
| Cron | `0 9 * * MON-FRI` | Standard 5-field cron (min hour dom mon dow) |

## Adding Skills

```ts
// skills/my-skill.ts
import { z } from "zod";
import { skills } from "../src/skills/engine";

skills.register({
  id: "my-skill",
  name: "My Skill",
  description: "A composable unit of work",
  input: z.object({ message: z.string() }),
  output: z.object({ result: z.string() }),
  execute: async (input) => {
    return { result: `Processed: ${input.message}` };
  },
});
```

## Credential Vault

Store credentials securely with AES-256-CBC encryption at rest.

```bash
# Generate an encryption key
openssl rand -base64 32
# Add to .env: KICKD_ENCRYPTION_KEY=<generated-key>

# Store a GitHub token
kickd creds add my-github github '{"token":"ghp_abc123..."}'

# Store Slack credentials
kickd creds add my-slack slack '{"botToken":"xoxb-...", "webhookUrl":"https://hooks.slack.com/..."}'

# Test connectivity
kickd creds test my-github
```

Built-in credential types: `bearer`, `api_key`, `basic_auth`, `oauth2`, `github`, `slack`, `discord`, `stripe`, `openai`, `anthropic`, `linkedin`, `sendgrid`, `aws`, `custom`.

## Event System

Create reactive rules — when something happens, do something else:

```bash
# When task "hello" completes, run the "disk-usage" task
kickd events add task.completed run_task:disk-usage --source hello

# When any skill fails, run a notification task
kickd events add skill.failed run_task:alert
```

Event types: `task.completed`, `task.failed`, `task.retry`, `skill.completed`, `skill.failed`, `webhook.triggered`.

## Webhook Triggers

Trigger tasks externally via HTTP:

```bash
# Create a webhook for the "hello" task
kickd webhook create deploy-hook task:hello

# Trigger it (e.g., from GitHub Actions, Stripe, etc.)
curl -X POST http://localhost:7400/hooks/<webhook-id> \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Notifications

Get alerted when tasks fail:

```bash
# Via CLI
kickd notify add slack https://hooks.slack.com/services/...
kickd notify add discord https://discord.com/api/webhooks/...

# Or via environment variables
KICKD_NOTIFY_SLACK_URL=https://hooks.slack.com/services/...
KICKD_NOTIFY_DISCORD_URL=https://discord.com/api/webhooks/...
```

## Plugins

Install skills from npm:

```bash
kickd install kickd-skill-example
kickd plugins
```

Plugin packages can export a `register(skills)` function or a `skills` array.

## Configuration

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `KICKD_PORT` | `7400` | HTTP API port |
| `KICKD_API_TOKEN` | — | Bearer token for API auth (optional) |
| `KICKD_ENCRYPTION_KEY` | — | AES-256 key for credential vault |
| `KICKD_NOTIFY_SLACK_URL` | — | Slack webhook for notifications |
| `KICKD_NOTIFY_DISCORD_URL` | — | Discord webhook for notifications |
| `KICKD_NOTIFY_WEBHOOK_URL` | — | Generic webhook for notifications |

## Running in Background

### macOS (launchd)

```bash
# Create plist at ~/Library/LaunchAgents/com.kickd.daemon.plist
# then:
launchctl load ~/Library/LaunchAgents/com.kickd.daemon.plist
```

### pm2

```bash
pm2 start "bun run start" --name kickd
pm2 save
```

## Architecture

```
┌──────────────┐    MCP (stdio)    ┌─────────────────────────────────┐
│  Claude Code │ ────────────────► │          kickd daemon           │
│              │ ◄──────────────── │                                 │
└──────────────┘                   │  ┌───────┐ ┌───────┐ ┌──────┐  │
                                   │  │ Tasks │ │Skills │ │Creds │  │
┌──────────────┐    HTTP :7400     │  └───┬───┘ └───┬───┘ └──────┘  │
│   You (CLI)  │ ────────────────► │      │         │               │
│              │ ◄──────────────── │  ┌───┴─────────┴───┐           │
└──────────────┘                   │  │   Event Bus     │           │
                                   │  └───┬─────────┬───┘           │
┌──────────────┐    Webhooks       │  ┌───┴───┐ ┌───┴────┐         │
│   External   │ ────────────────► │  │Notify │ │SQLite  │         │
│   Services   │                   │  └───────┘ └────────┘         │
└──────────────┘                   └─────────────────────────────────┘
```

## License

MIT
