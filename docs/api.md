# HTTP API Reference

The daemon exposes a REST API on `http://localhost:7400` (configurable via `KICKD_PORT`).

## Authentication

If `KICKD_API_TOKEN` is set, all requests require a bearer token:

```bash
curl -H "Authorization: Bearer your-token" http://localhost:7400/tasks
```

The `/health` endpoint and webhook POST endpoints (`/hooks/:id`) are exempt from auth.

## Rate limiting

Requests are rate-limited to 100 per minute per client IP. Disable with `KICKD_RATE_LIMIT=false`.

Rate limit headers are included in every response:
- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — remaining requests
- `X-RateLimit-Reset` — window reset time (unix timestamp)

---

## Health & Monitoring

### `GET /health`

Detailed health report with individual check results.

```json
{
  "status": "healthy",
  "uptime": 3600,
  "checks": [
    { "name": "database", "status": "healthy", "latencyMs": 0.1 },
    { "name": "tasks", "status": "healthy", "message": "3 registered, 0 failed" },
    { "name": "skills", "status": "healthy", "message": "2 registered" },
    { "name": "queue", "status": "healthy", "message": "0 active, 0 pending" },
    { "name": "memory", "status": "healthy", "message": "45MB RSS, 12MB heap used" }
  ],
  "timestamp": "2026-03-10T09:00:00.000Z"
}
```

Status codes: `200` for healthy/degraded, `503` for unhealthy.

### `GET /stats`

Global statistics for all task and skill runs.

### `GET /metrics`

Prometheus-compatible metrics in text format.

```
# HELP kickd_uptime_seconds Daemon uptime in seconds
# TYPE kickd_uptime_seconds gauge
kickd_uptime_seconds 3600.00

# HELP kickd_task_runs_total Total number of task runs
# TYPE kickd_task_runs_total counter
kickd_task_runs_total{status="success"} 42
kickd_task_runs_total{status="failure"} 3
...
```

---

## Tasks

### `GET /tasks`

List all registered tasks.

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
  "output": "Hello from kickd!",
  "duration": 1.23
}
```

### `GET /tasks/:id/history`

Task run history. Optional query: `?limit=20`.

### `GET /tasks/:id/stats`

Task statistics: total runs, success/failure counts, average duration.

---

## Skills

### `GET /skills`

List all registered skills with their input schemas.

### `POST /skills/:id/run`

Run a skill with input.

```bash
curl -X POST http://localhost:7400/skills/uppercase/run \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```

### `GET /skills/:id/history`

Skill run history. Optional query: `?limit=20`.

### `POST /skills/chain`

Chain multiple skills. Output from each step is passed as input to the next.

```bash
curl -X POST http://localhost:7400/skills/chain \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      { "skillId": "generate-content", "input": {"platform": "linkedin"} },
      { "skillId": "post-linkedin" }
    ]
  }'
```

---

## Workflows

### `GET /workflows`

List all registered workflows.

### `GET /workflows/:id`

Get a workflow definition.

### `POST /workflows`

Register a new workflow.

```bash
curl -X POST http://localhost:7400/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-pipeline",
    "name": "My Pipeline",
    "description": "A multi-step workflow",
    "startStep": "step1",
    "steps": [
      { "id": "step1", "type": "task", "targetId": "hello", "next": "step2" },
      { "id": "step2", "type": "skill", "targetId": "uppercase", "input": { "text": "done" } }
    ]
  }'
```

### `POST /workflows/:id/run`

Run a workflow. Accepts optional JSON input.

### `DELETE /workflows/:id`

Delete a workflow.

---

## Variables

### `GET /variables`

List all variables. Optional query: `?scope=global`.

### `GET /variables/:key`

Get a variable value.

### `PUT /variables/:key`

Set a variable.

```bash
curl -X PUT http://localhost:7400/variables/my-key \
  -H "Content-Type: application/json" \
  -d '{"value": "my-value", "scope": "global"}'
```

### `DELETE /variables/:key`

Delete a variable.

---

## Queue

### `GET /queue/stats`

Queue statistics.

```json
{
  "active": 2,
  "pending": 5,
  "concurrency": 5,
  "maxSize": 1000
}
```

### `POST /queue/clear`

Clear all pending items from the queue.

---

## Credentials

### `GET /credentials`

List all credentials (sensitive values redacted).

### `POST /credentials`

Store a new credential.

```bash
curl -X POST http://localhost:7400/credentials \
  -H "Content-Type: application/json" \
  -d '{"name":"my-github","typeId":"github","data":{"token":"ghp_..."}}'
```

### `GET /credentials/:id`

Get a credential (sensitive values redacted).

### `PUT /credentials/:id`

Update a credential.

### `DELETE /credentials/:id`

Delete a credential.

### `GET /credentials/types`

List available credential types.

### `GET /credentials/types/:id`

Get a credential type definition with field schemas.

### `POST /credentials/:id/test`

Test credential connectivity.

### `GET /credentials/:id/audit`

Credential audit log. Optional query: `?limit=50`.

### `POST /credentials/oauth2/start`

Start an OAuth2 authorization flow. Returns an `authUrl` to redirect the user to.

### `GET /credentials/oauth2/callback`

OAuth2 callback endpoint. Exchanges the authorization code for tokens and stores the credential.

---

## Webhooks

### `GET /hooks`

List all webhooks.

### `POST /hooks`

Create a webhook.

```bash
curl -X POST http://localhost:7400/hooks \
  -H "Content-Type: application/json" \
  -d '{"name":"deploy-hook","targetType":"task","targetId":"deploy"}'
```

### `POST /hooks/:id`

Trigger a webhook. Supports optional HMAC-SHA256 signature verification via `X-Hub-Signature-256` header.

### `DELETE /hooks/:id`

Delete a webhook.

---

## Events

### `GET /events`

Event log. Optional queries: `?limit=50&offset=0`.

### `GET /events/rules`

List all event rules.

### `POST /events/rules`

Create an event rule.

```bash
curl -X POST http://localhost:7400/events/rules \
  -H "Content-Type: application/json" \
  -d '{"eventType":"task.failed","actionType":"run_skill","targetId":"send-alert"}'
```

### `DELETE /events/rules/:id`

Delete an event rule.

---

## Notifications

### `GET /notifications/channels`

List notification channels.

### `POST /notifications/channels`

Add a notification channel.

```bash
curl -X POST http://localhost:7400/notifications/channels \
  -H "Content-Type: application/json" \
  -d '{"type":"slack","url":"https://hooks.slack.com/...","events":["task.failed"]}'
```

### `DELETE /notifications/channels/:id`

Delete a notification channel.

---

## Plugins

### `GET /plugins`

List installed plugins.

### `POST /plugins/install`

Install a plugin from npm.

```bash
curl -X POST http://localhost:7400/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"package":"kickd-skill-example"}'
```

### `POST /plugins/uninstall`

Uninstall a plugin.

---

## Claude Bridge

### `POST /claude`

Send a prompt to the Claude Code CLI.

```bash
curl -X POST http://localhost:7400/claude \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?"}'
```

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string (required) | The prompt to send |
| `workingDir` | string | Working directory for the Claude CLI process |
| `allowedTools` | string[] | Tools Claude is allowed to use |
