# Skills

Skills are composable, reusable building blocks. Each skill has typed input/output schemas (via Zod), can be run individually, and can be chained together.

## Creating a skill

Create a file in the `skills/` directory. Skills self-register when imported.

```ts
// skills/translate.ts
import { z } from "zod";
import { skills } from "kickd/skills";

skills.register({
  id: "translate",
  name: "Translate Text",
  description: "Translates text to a target language using Claude",
  input: z.object({
    text: z.string().describe("Text to translate"),
    language: z.string().describe("Target language"),
  }),
  output: z.object({
    translated: z.string(),
    language: z.string(),
  }),
  execute: async (input) => {
    // your logic
    return { translated: "...", language: input.language };
  },
});
```

## Running a skill

```bash
# Via CLI
bun run cli skill translate '{"text":"hello","language":"Spanish"}'

# Via HTTP
curl -X POST http://localhost:7400/skills/translate/run \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","language":"Spanish"}'
```

## Chaining skills

Chain multiple skills so the output of one feeds into the next.

### Via HTTP

```bash
curl -X POST http://localhost:7400/skills/chain \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      { "skillId": "generate-content", "input": {"platform":"linkedin","topics":["AI"]} },
      { "skillId": "post-linkedin" }
    ]
  }'
```

### Programmatically

```ts
import { skills } from "kickd/skills";

// Simple sequential calls
const content = await skills.run("generate-content", { platform: "linkedin", topics: ["AI"] });
const posted = await skills.run("post-linkedin", { content: content.output.content });

// Or use the chain API with input mapping
const result = await skills.chain([
  { skillId: "generate-content", mapInput: () => ({ platform: "linkedin", topics: ["AI"] }) },
  { skillId: "post-linkedin", mapInput: (prev) => ({ content: prev.content }) },
]);
```

## Input validation

Inputs are validated against the Zod schema before execution. Invalid input returns an error without running the skill:

```json
{
  "success": false,
  "output": null,
  "error": "Invalid input: Expected string, received number at \"text\""
}
```

## Listing skills

```bash
# CLI
bun run cli skills

# HTTP
curl http://localhost:7400/skills

# MCP (Claude Code)
# Use the list_automations tool
```

The response includes each skill's ID, name, description, and input schema.
