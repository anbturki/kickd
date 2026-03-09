# HTTP API Reference

The daemon exposes a REST API on `http://localhost:7400` (configurable via `AUTOMATION_PORT`).

## Health

### `GET /health`

Returns daemon status.

```json
{
  "status": "ok",
  "uptime": 3600,
  "tasks": 3,
  "skills": 2
}
```

## Tasks

### `GET /tasks`

List all registered tasks.

```bash
curl http://localhost:7400/tasks
```

```json
[
  {
    "id": "hello",
    "name": "Hello World",
    "description": "A simple example task",
    "schedule": null,
    "enabled": true,
    "status": "idle"
  }
]
```

### `GET /tasks/:id`

Get a single task by ID. Returns `404` if not found.

### `POST /tasks/:id/run`

Run a task. Accepts an optional JSON body with parameters.

```bash
curl -X POST http://localhost:7400/tasks/hello/run
```

```json
{
  "success": true,
  "output": "Hello from automation! Current time: 2026-03-09T12:00:00.000Z",
  "duration": 1.23
}
```

With parameters:

```bash
curl -X POST http://localhost:7400/tasks/linkedin-post/run \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "topic": "AI agents"}'
```

## Skills

### `GET /skills`

List all registered skills with their input schemas.

### `POST /skills/:id/run`

Run a skill with input.

```bash
curl -X POST http://localhost:7400/skills/post-linkedin/run \
  -H "Content-Type: application/json" \
  -d '{"content": "My post text", "dryRun": true}'
```

```json
{
  "success": true,
  "output": {
    "posted": false,
    "content": "My post text",
    "postId": "[dry-run]"
  }
}
```

### `POST /skills/chain`

Chain multiple skills. Output from each step is passed as input to the next.

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

On failure, the response includes which step failed:

```json
{
  "success": false,
  "output": null,
  "error": "Missing LINKEDIN_ACCESS_TOKEN",
  "step": 1
}
```

## Claude Bridge

### `POST /claude`

Send a prompt to the Claude Code CLI.

```bash
curl -X POST http://localhost:7400/claude \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?"}'
```

```json
{
  "success": true,
  "output": "4",
  "exitCode": 0
}
```

Optional fields:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string (required) | The prompt to send |
| `workingDir` | string | Working directory for the Claude CLI process |
| `allowedTools` | string[] | Tools Claude is allowed to use |
