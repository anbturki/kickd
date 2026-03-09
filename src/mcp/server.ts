import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registry } from "../tasks/registry";
import { skills } from "../skills/engine";
import { askClaude } from "../bridge/claude";

export function createMcpServer() {
  const server = new McpServer({
    name: "automation",
    version: "1.0.0",
  });

  // ── Tasks ──

  server.tool("list_automations", "List all registered automation tasks and skills", {}, async () => {
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
