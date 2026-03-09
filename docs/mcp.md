# MCP Integration

kickd includes an MCP (Model Context Protocol) server that lets Claude Code call your tasks and skills directly as tools.

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

Once connected, Claude Code can use these tools:

### `list_automations`

Lists all registered tasks and skills. No parameters.

### `run_automation`

Runs a task by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | yes | The task ID to run |
| `params` | object | no | Parameters to pass to the task |

### `run_skill`

Runs a skill with input.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | yes | The skill ID to run |
| `input` | object | no | Input data matching the skill's schema |

### `chain_skills`

Chains multiple skills in sequence.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `steps` | array | yes | `[{ skillId: string, inputOverrides?: object }]` |

### `run_command`

Executes a shell command on the host machine.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | yes | Shell command to execute |
| `cwd` | string | no | Working directory |

### `ask_claude`

Sends a prompt to the Claude Code CLI (enables chaining Claude calls).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The prompt text |
| `workingDir` | string | no | Working directory context |

## Example conversations with Claude Code

Once configured, you can say things like:

- *"List my automations"*
- *"Run the hello task"*
- *"Generate a LinkedIn post about developer productivity"*
- *"Chain generate-content and post-linkedin skills"*
- *"Run `ls -la` on my machine"*
