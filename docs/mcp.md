# MCP Integration

kickd includes an MCP (Model Context Protocol) server that lets Claude Code call your tasks, skills, workflows, and more directly as tools.

## Setup

Add to your `~/.claude.json`:

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

Or add to your project's `.mcp.json`:

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

Restart Claude Code after adding the config.

## Available tools

### Tasks & Skills

| Tool | Description |
|------|-------------|
| `list_automations` | List all registered tasks and skills |
| `run_automation` | Run a task by ID with optional params |
| `get_task_history` | Get execution history for a task |
| `run_skill` | Run a skill with input |
| `chain_skills` | Chain multiple skills in sequence |

### Workflows

| Tool | Description |
|------|-------------|
| `list_workflows` | List all registered workflows |
| `run_workflow` | Run a workflow by ID with optional input |

### Variables

| Tool | Description |
|------|-------------|
| `set_variable` | Set a persistent variable |
| `get_variable` | Get a variable value |
| `list_variables` | List all variables (optionally filter by scope) |

### Credentials

| Tool | Description |
|------|-------------|
| `list_credentials` | List stored credentials (redacted) |
| `list_credential_types` | List available credential types |
| `store_credential` | Store a new credential securely |
| `test_credential` | Test credential connectivity |

### Events & Webhooks

| Tool | Description |
|------|-------------|
| `list_event_rules` | List all reactive rules |
| `create_event_rule` | Create a new reactive rule |
| `list_webhooks` | List all webhooks |
| `create_webhook` | Create a webhook trigger |

### System

| Tool | Description |
|------|-------------|
| `queue_stats` | Get task queue statistics |
| `get_stats` | Get global run statistics |
| `run_command` | Execute a shell command on the host |
| `ask_claude` | Send a prompt to Claude Code CLI |

## Tool parameters

### `run_automation`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | yes | The task ID to run |
| `params` | object | no | Parameters to pass |

### `run_skill`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | yes | The skill ID |
| `input` | object | no | Input matching the skill's schema |

### `chain_skills`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `steps` | array | yes | `[{ skillId: string, inputOverrides?: object }]` |

### `run_workflow`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflowId` | string | yes | The workflow ID |
| `input` | object | no | Initial input for the workflow |

### `store_credential`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Friendly name |
| `typeId` | string | yes | Credential type (github, slack, etc.) |
| `data` | object | yes | Credential data |
| `tags` | string[] | no | Optional tags |

### `create_event_rule`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventType` | string | yes | Event to react to |
| `sourceId` | string | no | Filter by source ID |
| `actionType` | enum | yes | `run_task` or `run_skill` |
| `targetId` | string | yes | Target task/skill ID |
| `actionInput` | object | no | Input to pass |

### `run_command`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | yes | Shell command |
| `cwd` | string | no | Working directory |

## Example conversations

Once configured, you can say things like:

- *"List my automations"*
- *"Run the hello task"*
- *"Run the deploy-pipeline workflow"*
- *"Set a variable called api_url to https://api.example.com"*
- *"Store a GitHub credential named my-gh with token ghp_abc123"*
- *"Create a rule: when task hello fails, run skill send-alert"*
- *"Show me the queue stats"*
- *"Chain generate-content and post-linkedin skills"*
