# Events & Notifications

kickd has an event-driven architecture. Every task run, skill execution, webhook trigger, and workflow step emits events. You can react to these with rules, and get notified via Slack, Discord, or webhooks.

## Event types

| Event | Emitted when |
|-------|-------------|
| `task.completed` | A task finishes successfully |
| `task.failed` | A task fails |
| `task.retry` | A task is being retried |
| `skill.completed` | A skill finishes successfully |
| `skill.failed` | A skill fails |
| `webhook.triggered` | A webhook is triggered |
| `workflow.started` | A workflow begins execution |
| `workflow.completed` | A workflow completes successfully |
| `workflow.failed` | A workflow fails |

## Reactive rules

Create rules to react to events automatically:

```bash
# When task "hello" completes, run the "disk-usage" task
kickd events add task.completed run_task:disk-usage --source hello

# When any skill fails, run a notification task
kickd events add skill.failed run_task:alert

# When a webhook fires, run a skill
kickd events add webhook.triggered run_skill:process-payload
```

Via HTTP:

```bash
curl -X POST http://localhost:7400/events/rules \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "task.failed",
    "actionType": "run_skill",
    "targetId": "send-alert",
    "actionInput": {"channel": "ops"}
  }'
```

Rules support optional `sourceId` filtering — only trigger when the event comes from a specific task/skill.

## Managing rules

```bash
kickd events rules           # List all rules
kickd events add ...         # Create a rule
kickd events delete <id>     # Delete a rule
```

## Event log

All events are logged to SQLite:

```bash
# Recent events
kickd events

# Via HTTP
curl http://localhost:7400/events?limit=50&offset=0
```

## Depth limiting

Events can trigger rules that emit more events. To prevent infinite loops, the event bus limits depth to 10 levels. Events beyond that are dropped with a warning.

## Notifications

Get alerted on events via Slack, Discord, or generic webhooks.

### Quick setup via environment variables

```bash
KICKD_NOTIFY_SLACK_URL=https://hooks.slack.com/services/T.../B.../...
KICKD_NOTIFY_DISCORD_URL=https://discord.com/api/webhooks/.../...
KICKD_NOTIFY_WEBHOOK_URL=https://your-webhook.example.com/notify
```

These subscribe to all `task.failed` and `skill.failed` events automatically.

### Via CLI

```bash
# Subscribe to specific events
kickd notify add slack https://hooks.slack.com/... task.failed,skill.failed
kickd notify add discord https://discord.com/api/webhooks/... "*"

# List channels
kickd notify list

# Remove a channel
kickd notify delete <id>
```

### Via HTTP

```bash
curl -X POST http://localhost:7400/notifications/channels \
  -H "Content-Type: application/json" \
  -d '{
    "type": "slack",
    "url": "https://hooks.slack.com/services/...",
    "events": ["task.failed", "workflow.failed"]
  }'
```

### Notification format

**Slack** — sends Block Kit formatted messages with event details.

**Discord** — sends embed-formatted messages with colored sidebars.

**Webhook** — sends JSON payload with optional HMAC-SHA256 signature in `X-Kickd-Signature` header.
