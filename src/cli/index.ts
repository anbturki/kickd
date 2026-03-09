import { parseArgs } from "util";
import { config } from "../config";

const baseUrl = `http://localhost:${config.port}`;

const { positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
});

const [command, ...rest] = positionals;

async function main() {
  switch (command) {
    case "tasks":
    case "list": {
      const res = await fetch(`${baseUrl}/tasks`);
      const tasks = await res.json();
      if (tasks.length === 0) {
        console.log("No tasks registered.");
      } else {
        console.log("\nRegistered tasks:");
        for (const t of tasks) {
          const status = t.status === "running" ? " [running]" : "";
          const schedule = t.schedule ? ` (every ${t.schedule})` : "";
          console.log(`  ${t.id} - ${t.name}${schedule}${status}`);
        }
      }
      break;
    }

    case "run": {
      const taskId = rest[0];
      if (!taskId) {
        console.error("Usage: kickd run <task-id>");
        process.exit(1);
      }
      console.log(`Running task: ${taskId}...`);
      const res = await fetch(`${baseUrl}/tasks/${taskId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      console.log(result.success ? "Success:" : "Failed:", result.output);
      console.log(`Duration: ${Math.round(result.duration)}ms`);
      break;
    }

    case "ask": {
      const prompt = rest.join(" ");
      if (!prompt) {
        console.error("Usage: kickd ask <prompt>");
        process.exit(1);
      }
      console.log("Asking Claude...");
      const res = await fetch(`${baseUrl}/claude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const result = await res.json();
      console.log(result.output);
      break;
    }

    case "skills": {
      const res = await fetch(`${baseUrl}/skills`);
      const list = await res.json();
      if (list.length === 0) {
        console.log("No skills registered.");
      } else {
        console.log("\nRegistered skills:");
        for (const s of list) {
          console.log(`  ${s.id} - ${s.name}`);
          console.log(`    ${s.description}`);
        }
      }
      break;
    }

    case "skill": {
      const skillId = rest[0];
      if (!skillId) {
        console.error("Usage: kickd skill <skill-id> [json-input]");
        process.exit(1);
      }
      const input = rest[1] ? JSON.parse(rest[1]) : {};
      console.log(`Running skill: ${skillId}...`);
      const res = await fetch(`${baseUrl}/skills/${skillId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await res.json();
      if (result.success) {
        console.log("Success:", JSON.stringify(result.output, null, 2));
      } else {
        console.error("Failed:", result.error);
      }
      break;
    }

    case "health": {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      console.log(`Status: ${data.status}, Uptime: ${Math.round(data.uptime)}s`);
      console.log(`Tasks: ${data.tasks}, Skills: ${data.skills}`);
      break;
    }

    default:
      console.log(`
kickd - Background automation daemon

Usage:
  kickd <command> [args]

Commands:
  list              List all registered tasks
  skills            List all registered skills
  run <id>          Run a task by ID
  skill <id> [json] Run a skill with optional JSON input
  ask <prompt>      Ask Claude Code a question
  health            Check daemon health

The daemon is started with: bun run start
MCP mode is started with: bun run mcp
`);
  }
}

main().catch(console.error);
