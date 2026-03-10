import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { askClaude } from "../bridge/claude";
import * as db from "../db";
import * as credStore from "../credentials/store";

export function createMcpServer() {
  const server = new McpServer({
    name: "kickd",
    version: "0.1.0",
  });

  // ── Tasks ──

  server.tool("list_automations", "List all registered tasks, skills, and their status", {}, async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ tasks: registry.list(), skills: skills.list() }, null, 2),
        },
      ],
    };
  });

  server.tool(
    "run_automation",
    "Run a registered automation task by its ID",
    {
      taskId: z.string().describe("The ID of the task to run"),
      params: z.record(z.unknown()).optional().describe("Optional parameters"),
    },
    async ({ taskId, params }) => {
      const result = await registry.run(taskId, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "get_task_history",
    "Get execution history for a task",
    {
      taskId: z.string().describe("The task ID"),
      limit: z.number().optional().describe("Number of records to return (default 20)"),
    },
    async ({ taskId, limit }) => {
      const history = registry.history(taskId, limit ?? 20);
      return {
        content: [{ type: "text", text: JSON.stringify(history, null, 2) }],
      };
    }
  );

  // ── Skills ──

  server.tool(
    "run_skill",
    "Run a registered skill with the given input",
    {
      skillId: z.string().describe("The ID of the skill to run"),
      input: z.record(z.unknown()).optional().describe("Input parameters for the skill"),
    },
    async ({ skillId, input }) => {
      const result = await skills.run(skillId, input ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "chain_skills",
    "Chain multiple skills together, piping output from one to the next",
    {
      steps: z
        .array(z.object({ skillId: z.string(), inputOverrides: z.record(z.unknown()).optional() }))
        .describe("Ordered list of skills to run in sequence"),
    },
    async ({ steps }) => {
      const mapped = steps.map((s) => ({
        skillId: s.skillId,
        mapInput: s.inputOverrides
          ? (prev: unknown) => ({ ...(prev as Record<string, unknown>), ...s.inputOverrides })
          : undefined,
      }));
      const result = await skills.chain(mapped);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── Webhooks ──

  server.tool(
    "list_webhooks",
    "List all registered webhooks",
    {},
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(db.getWebhooks(), null, 2) }],
      };
    }
  );

  server.tool(
    "create_webhook",
    "Create a webhook trigger for a task or skill",
    {
      name: z.string().describe("Name for the webhook"),
      targetType: z.enum(["task", "skill", "chain"]).describe("What to trigger"),
      targetId: z.string().describe("ID of the task or skill to trigger"),
    },
    async ({ name, targetType, targetId }) => {
      const id = crypto.randomUUID().slice(0, 8);
      const secret = crypto.randomUUID();
      db.createWebhook({ id, name, targetType, targetId, secret });
      return {
        content: [{ type: "text", text: JSON.stringify({ id, secret, url: `/hooks/${id}` }, null, 2) }],
      };
    }
  );

  // ── Credentials ──

  server.tool(
    "list_credentials",
    "List all stored credentials (secrets are redacted)",
    {},
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(credStore.listCredentials(), null, 2) }],
      };
    }
  );

  server.tool(
    "list_credential_types",
    "List available credential types (github, slack, linkedin, etc.)",
    {},
    async () => {
      const types = credStore.getCredentialTypes().map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        authType: t.authType,
        fields: t.fields.map((f) => `${f.name}${f.required ? "" : "?"}`),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(types, null, 2) }],
      };
    }
  );

  server.tool(
    "store_credential",
    "Store a new credential securely",
    {
      name: z.string().describe("Friendly name for the credential"),
      typeId: z.string().describe("Credential type (github, slack, bearer, api_key, etc.)"),
      data: z.record(z.unknown()).describe("Credential data (sensitive fields are encrypted)"),
      tags: z.array(z.string()).optional().describe("Optional tags"),
    },
    async ({ name, typeId, data, tags }) => {
      try {
        const cred = credStore.createCredential({ name, typeId, data, tags });
        return {
          content: [{ type: "text", text: JSON.stringify(cred, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }] };
      }
    }
  );

  server.tool(
    "test_credential",
    "Test if a credential works by connecting to its API",
    {
      nameOrId: z.string().describe("Credential name or ID"),
    },
    async ({ nameOrId }) => {
      const result = await credStore.testCredential(nameOrId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── Events ──

  server.tool(
    "list_event_rules",
    "List all event rules (reactive automations)",
    {},
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(db.getAllEventRules(), null, 2) }],
      };
    }
  );

  server.tool(
    "create_event_rule",
    "Create a reactive rule: when event X happens, run task/skill Y",
    {
      eventType: z.string().describe("Event to react to (e.g. task.completed, task.failed, skill.completed)"),
      sourceId: z.string().optional().describe("Only trigger for this specific source ID"),
      actionType: z.enum(["run_task", "run_skill"]).describe("What to do when the event fires"),
      targetId: z.string().describe("ID of the task or skill to run"),
      actionInput: z.record(z.unknown()).optional().describe("Input to pass to the action"),
    },
    async ({ eventType, sourceId, actionType, targetId, actionInput }) => {
      const id = crypto.randomUUID().slice(0, 8);
      db.createEventRule({ id, eventType, sourceId, actionType, targetId, actionInput });
      return {
        content: [{ type: "text", text: JSON.stringify({ id, eventType, actionType, targetId }, null, 2) }],
      };
    }
  );

  // ── Stats ──

  server.tool(
    "get_stats",
    "Get global statistics: total runs, success/failure rates, etc.",
    {},
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(db.getGlobalStats(), null, 2) }],
      };
    }
  );

  // ── Shell & Claude ──

  server.tool(
    "run_command",
    "Run a shell command on the host machine",
    {
      command: z.string().describe("The shell command to execute"),
      cwd: z.string().optional().describe("Working directory"),
    },
    async ({ command, cwd }) => {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: cwd ?? process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return {
        content: [{ type: "text", text: JSON.stringify({ exitCode, stdout, stderr }, null, 2) }],
      };
    }
  );

  server.tool(
    "ask_claude",
    "Send a prompt to Claude Code CLI and get a response",
    {
      prompt: z.string().describe("The prompt to send to Claude"),
      workingDir: z.string().optional().describe("Working directory context"),
    },
    async ({ prompt, workingDir }) => {
      const result = await askClaude({ prompt, workingDir });
      return {
        content: [{ type: "text", text: result.output }],
      };
    }
  );

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
