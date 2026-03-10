# Workflows

Workflows are multi-step pipelines that combine tasks, skills, conditions, delays, and parallel execution into a single executable unit.

## Creating a workflow

Register a workflow via the HTTP API:

```bash
curl -X POST http://localhost:7400/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "id": "deploy-pipeline",
    "name": "Deploy Pipeline",
    "description": "Build, test, and deploy",
    "startStep": "build",
    "steps": [
      { "id": "build", "type": "task", "targetId": "build-app", "next": "test" },
      { "id": "test", "type": "task", "targetId": "run-tests", "next": "check" },
      { "id": "check", "type": "condition", "condition": "true", "onTrue": "deploy", "onFalse": "notify" },
      { "id": "deploy", "type": "skill", "targetId": "deploy-prod" },
      { "id": "notify", "type": "skill", "targetId": "send-alert", "input": { "message": "Tests failed" } }
    ]
  }'
```

Or programmatically:

```ts
import { workflows } from "../src/workflows";

workflows.register({
  id: "content-pipeline",
  name: "Content Pipeline",
  description: "Generate and post content",
  startStep: "generate",
  steps: [
    { id: "generate", type: "skill", targetId: "generate-content", input: { platform: "linkedin" }, next: "post" },
    { id: "post", type: "skill", targetId: "post-linkedin" },
  ],
});
```

## Step types

### Task step

Runs a registered task:

```json
{ "id": "build", "type": "task", "targetId": "build-app", "next": "test" }
```

### Skill step

Runs a registered skill:

```json
{ "id": "post", "type": "skill", "targetId": "post-linkedin", "input": { "content": "Hello" } }
```

### Condition step

Evaluates a condition and branches:

```json
{
  "id": "check",
  "type": "condition",
  "condition": "{{prev.success}} === true",
  "onTrue": "deploy",
  "onFalse": "rollback"
}
```

### Delay step

Waits for a specified duration (in milliseconds):

```json
{ "id": "wait", "type": "delay", "delayMs": 5000, "next": "check-status" }
```

### Parallel step

Runs multiple steps concurrently:

```json
{
  "id": "parallel-checks",
  "type": "parallel",
  "parallel": ["check-api", "check-db", "check-cache"],
  "next": "deploy"
}
```

## Input mapping

Use template strings to reference previous step outputs:

```json
{
  "id": "post",
  "type": "skill",
  "targetId": "post-linkedin",
  "input": {
    "content": "{{prev.content}}",
    "author": "{{steps.generate.author}}"
  }
}
```

- `{{prev.field}}` — references the output of the previous step
- `{{steps.stepId.field}}` — references the output of a specific step by ID

## Error handling

By default, a workflow stops when a step fails. Use `continueOnError` to keep going:

```json
{ "id": "optional", "type": "task", "targetId": "cleanup", "continueOnError": true, "next": "done" }
```

## Running a workflow

```bash
# Via CLI
kickd workflow run deploy-pipeline

# Via HTTP
curl -X POST http://localhost:7400/workflows/deploy-pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"branch": "main"}'

# Via MCP (Claude Code)
# "run the deploy-pipeline workflow"
```

## Workflow result

```json
{
  "workflowId": "deploy-pipeline",
  "success": true,
  "steps": [
    { "stepId": "build", "success": true, "output": "Built", "duration": 1234 },
    { "stepId": "test", "success": true, "output": "All tests pass", "duration": 5678 },
    { "stepId": "deploy", "success": true, "output": "Deployed v2.1", "duration": 3456 }
  ],
  "totalDuration": 10368
}
```

## Events

Workflows emit events:

- `workflow.started` — workflow execution began
- `workflow.completed` — all steps succeeded
- `workflow.failed` — a step failed and stopped the workflow

## Managing workflows

```bash
kickd workflow list           # List all workflows
kickd workflow run <id>       # Run a workflow
kickd workflow delete <id>    # Delete a workflow
```
