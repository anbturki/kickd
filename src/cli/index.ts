import { parseArgs } from "util";
import { config } from "../config";

const baseUrl = `http://localhost:${config.port}`;

const { positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
});

const [command, ...rest] = positionals;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.KICKD_API_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  return res.json();
}

async function main() {
  switch (command) {
    // ── Tasks ──

    case "tasks":
    case "list": {
      const tasks = await request("/tasks");
      if (tasks.length === 0) {
        console.log("No tasks registered.");
      } else {
        console.log("\nRegistered tasks:");
        for (const t of tasks) {
          const status = t.status === "running" ? " [running]" : "";
          const schedule = t.schedule ? ` (${t.schedule})` : "";
          const retry = t.retry ? ` [retry: ${t.retry.maxAttempts}x]` : "";
          console.log(`  ${t.id} - ${t.name}${schedule}${retry}${status}`);
          if (t.nextRun) console.log(`    Next run: ${t.nextRun}`);
        }
      }
      break;
    }

    case "run": {
      const taskId = rest[0];
      if (!taskId) {
        console.error("Usage: kickd run <task-id> [json-params]");
        process.exit(1);
      }
      const params = rest[1] ? JSON.parse(rest[1]) : {};
      console.log(`Running task: ${taskId}...`);
      const result = await request(`/tasks/${taskId}/run`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      console.log(result.success ? "Success:" : "Failed:", result.output);
      console.log(`Duration: ${Math.round(result.duration)}ms`);
      break;
    }

    case "history": {
      const id = rest[0];
      if (!id) {
        console.error("Usage: kickd history <task-id|skill-id> [--type task|skill]");
        process.exit(1);
      }
      const type = rest.includes("--skill") ? "skills" : "tasks";
      const history = await request(`/${type}/${id}/history?limit=10`);
      if (history.length === 0) {
        console.log("No history found.");
      } else {
        console.log(`\nLast ${history.length} runs for ${id}:`);
        for (const h of history) {
          const status = h.status === "completed" ? "OK" : "FAIL";
          const duration = h.duration_ms ? `${Math.round(h.duration_ms)}ms` : "-";
          console.log(`  [${status}] ${h.started_at} (${duration})`);
          if (h.output) console.log(`    ${String(h.output).slice(0, 100)}`);
          if (h.error) console.log(`    Error: ${h.error}`);
        }
      }
      break;
    }

    // ── Skills ──

    case "skills": {
      const list = await request("/skills");
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
      const result = await request(`/skills/${skillId}/run`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (result.success) {
        console.log("Success:", JSON.stringify(result.output, null, 2));
      } else {
        console.error("Failed:", result.error);
      }
      break;
    }

    // ── Webhooks ──

    case "webhooks":
    case "webhook": {
      const sub = rest[0];
      if (!sub || sub === "list") {
        const hooks = await request("/hooks");
        if (hooks.length === 0) {
          console.log("No webhooks registered.");
        } else {
          console.log("\nWebhooks:");
          for (const h of hooks) {
            const status = h.enabled ? "enabled" : "disabled";
            console.log(`  ${h.id} - ${h.name} -> ${h.target_type}:${h.target_id} [${status}]`);
          }
        }
      } else if (sub === "create") {
        const name = rest[1];
        const targetArg = rest[2]; // e.g. "task:hello"
        if (!name || !targetArg) {
          console.error("Usage: kickd webhook create <name> <task|skill|chain>:<target-id>");
          process.exit(1);
        }
        const [targetType, targetId] = targetArg.split(":");
        const result = await request("/hooks", {
          method: "POST",
          body: JSON.stringify({ name, targetType, targetId }),
        });
        console.log(`Created webhook: ${result.id}`);
        console.log(`URL: POST /hooks/${result.id}`);
        console.log(`Secret: ${result.secret}`);
      } else if (sub === "delete") {
        const id = rest[1];
        if (!id) {
          console.error("Usage: kickd webhook delete <id>");
          process.exit(1);
        }
        await request(`/hooks/${id}`, { method: "DELETE" });
        console.log(`Deleted webhook: ${id}`);
      }
      break;
    }

    // ── Events ──

    case "events": {
      const sub = rest[0];
      if (sub === "rules") {
        const rules = await request("/events/rules");
        if (rules.length === 0) {
          console.log("No event rules.");
        } else {
          console.log("\nEvent rules:");
          for (const r of rules) {
            const status = r.enabled ? "enabled" : "disabled";
            const source = r.source_id ? ` from ${r.source_id}` : "";
            console.log(`  ${r.id}: on ${r.event_type}${source} -> ${r.action_type}(${r.target_id}) [${status}]`);
          }
        }
      } else if (sub === "add") {
        const eventType = rest[1];
        const actionArg = rest[2]; // "run_task:hello" or "run_skill:generate-content"
        if (!eventType || !actionArg) {
          console.error("Usage: kickd events add <event-type> <run_task|run_skill>:<target-id> [--source <id>]");
          process.exit(1);
        }
        const [actionType, targetId] = actionArg.split(":");
        const sourceIdx = rest.indexOf("--source");
        const sourceId = sourceIdx !== -1 ? rest[sourceIdx + 1] : undefined;
        const result = await request("/events/rules", {
          method: "POST",
          body: JSON.stringify({ eventType, actionType, targetId, sourceId }),
        });
        console.log(`Created rule: ${result.id}`);
      } else if (sub === "delete") {
        const id = rest[1];
        if (!id) {
          console.error("Usage: kickd events delete <rule-id>");
          process.exit(1);
        }
        await request(`/events/rules/${id}`, { method: "DELETE" });
        console.log(`Deleted rule: ${id}`);
      } else {
        // Default: show recent events
        const events = await request("/events?limit=20");
        if (events.length === 0) {
          console.log("No events logged.");
        } else {
          console.log("\nRecent events:");
          for (const e of events) {
            console.log(`  [${e.created_at}] ${e.event_type} ${e.source_type}/${e.source_id}`);
          }
        }
      }
      break;
    }

    // ── Notifications ──

    case "notify": {
      const sub = rest[0];
      if (!sub || sub === "list") {
        const channels = await request("/notifications/channels");
        if (channels.length === 0) {
          console.log("No notification channels configured.");
        } else {
          console.log("\nNotification channels:");
          for (const ch of channels) {
            const events = JSON.parse(ch.events).join(", ");
            console.log(`  ${ch.id} [${ch.type}] -> ${events}`);
          }
        }
      } else if (sub === "add") {
        const type = rest[1]; // slack, discord, webhook
        const url = rest[2];
        const events = rest[3] ? rest[3].split(",") : ["*"];
        if (!type || !url) {
          console.error("Usage: kickd notify add <slack|discord|webhook> <url> [events,comma,separated]");
          process.exit(1);
        }
        const result = await request("/notifications/channels", {
          method: "POST",
          body: JSON.stringify({ type, url, events }),
        });
        console.log(`Added notification channel: ${result.id}`);
      } else if (sub === "delete") {
        const id = rest[1];
        if (!id) {
          console.error("Usage: kickd notify delete <id>");
          process.exit(1);
        }
        await request(`/notifications/channels/${id}`, { method: "DELETE" });
        console.log(`Deleted channel: ${id}`);
      }
      break;
    }

    // ── Credentials ──

    case "creds":
    case "credentials": {
      const sub = rest[0];
      if (!sub || sub === "list") {
        const creds = await request("/credentials");
        if (creds.length === 0) {
          console.log("No credentials stored.");
        } else {
          console.log("\nStored credentials:");
          for (const c of creds) {
            const tags = c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
            console.log(`  ${c.name} (${c.typeId})${tags}`);
            console.log(`    id: ${c.id} | created: ${c.createdAt}`);
          }
        }
      } else if (sub === "add") {
        const name = rest[1];
        const typeId = rest[2];
        const dataStr = rest[3];
        if (!name || !typeId || !dataStr) {
          console.error('Usage: kickd creds add <name> <type> \'{"key":"value"}\'');
          console.error("Types: bearer, api_key, basic_auth, oauth2, github, slack, linkedin, ...");
          process.exit(1);
        }
        const data = JSON.parse(dataStr);
        const result = await request("/credentials", {
          method: "POST",
          body: JSON.stringify({ name, typeId, data }),
        });
        if (result.id) {
          console.log(`Created credential: ${result.name} (${result.id})`);
        } else {
          console.error("Failed:", result.error);
        }
      } else if (sub === "get") {
        const nameOrId = rest[1];
        if (!nameOrId) {
          console.error("Usage: kickd creds get <name-or-id>");
          process.exit(1);
        }
        const cred = await request(`/credentials/${nameOrId}`);
        if (cred.error) {
          console.error(cred.error);
        } else {
          console.log(`\n${cred.name} (${cred.typeId})`);
          console.log("Data (sensitive values redacted):");
          for (const [key, value] of Object.entries(cred.data)) {
            console.log(`  ${key}: ${value}`);
          }
        }
      } else if (sub === "test") {
        const nameOrId = rest[1];
        if (!nameOrId) {
          console.error("Usage: kickd creds test <name-or-id>");
          process.exit(1);
        }
        console.log("Testing connection...");
        const result = await request(`/credentials/${nameOrId}/test`, { method: "POST" });
        console.log(result.success ? `OK: ${result.message}` : `Failed: ${result.message}`);
      } else if (sub === "delete") {
        const nameOrId = rest[1];
        if (!nameOrId) {
          console.error("Usage: kickd creds delete <name-or-id>");
          process.exit(1);
        }
        await request(`/credentials/${nameOrId}`, { method: "DELETE" });
        console.log("Deleted.");
      } else if (sub === "types") {
        const types = await request("/credentials/types");
        console.log("\nAvailable credential types:");
        const byCategory = new Map<string, typeof types>();
        for (const t of types) {
          const cat = t.category ?? "other";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(t);
        }
        for (const [cat, catTypes] of byCategory) {
          console.log(`\n  ${cat}:`);
          for (const t of catTypes) {
            const fields = t.fields.map((f: { name: string; required: boolean }) =>
              f.required ? f.name : `${f.name}?`
            ).join(", ");
            console.log(`    ${t.id} - ${t.name} (${fields})`);
          }
        }
      }
      break;
    }

    // ── Workflows ──

    case "workflows":
    case "workflow": {
      const sub = rest[0];
      if (!sub || sub === "list") {
        const list = await request("/workflows");
        if (list.length === 0) {
          console.log("No workflows registered.");
        } else {
          console.log("\nWorkflows:");
          for (const w of list) {
            const trigger = w.trigger ? ` [${w.trigger.type}]` : " [manual]";
            console.log(`  ${w.id} - ${w.name}${trigger} (${w.stepCount} steps)`);
          }
        }
      } else if (sub === "run") {
        const id = rest[1];
        if (!id) {
          console.error("Usage: kickd workflow run <id> [json-input]");
          process.exit(1);
        }
        const input = rest[2] ? JSON.parse(rest[2]) : {};
        console.log(`Running workflow: ${id}...`);
        const result = await request(`/workflows/${id}/run`, {
          method: "POST",
          body: JSON.stringify(input),
        });
        console.log(result.success ? "Completed successfully" : "Failed");
        console.log(`Duration: ${Math.round(result.totalDuration)}ms`);
        console.log(`Steps: ${result.steps.length}`);
        for (const step of result.steps) {
          const status = step.success ? "OK" : "FAIL";
          console.log(`  [${status}] ${step.stepId} (${Math.round(step.duration)}ms)`);
          if (step.error) console.log(`    Error: ${step.error}`);
        }
      } else if (sub === "delete") {
        const id = rest[1];
        if (!id) {
          console.error("Usage: kickd workflow delete <id>");
          process.exit(1);
        }
        await request(`/workflows/${id}`, { method: "DELETE" });
        console.log(`Deleted workflow: ${id}`);
      }
      break;
    }

    // ── Variables ──

    case "vars":
    case "variables": {
      const sub = rest[0];
      if (!sub || sub === "list") {
        const scope = rest[1];
        const path = scope ? `/variables?scope=${scope}` : "/variables";
        const vars = await request(path);
        if (vars.length === 0) {
          console.log("No variables set.");
        } else {
          console.log("\nVariables:");
          for (const v of vars) {
            console.log(`  ${v.key} = ${v.value} [${v.scope}]`);
          }
        }
      } else if (sub === "set") {
        const key = rest[1];
        const value = rest[2];
        if (!key || value === undefined) {
          console.error("Usage: kickd vars set <key> <value> [--scope <scope>]");
          process.exit(1);
        }
        const scopeIdx = rest.indexOf("--scope");
        const scope = scopeIdx !== -1 ? rest[scopeIdx + 1] : "global";
        await request(`/variables/${key}`, {
          method: "PUT",
          body: JSON.stringify({ value, scope }),
        });
        console.log(`Set ${key} = ${value}`);
      } else if (sub === "get") {
        const key = rest[1];
        if (!key) {
          console.error("Usage: kickd vars get <key>");
          process.exit(1);
        }
        const result = await request(`/variables/${key}`);
        if (result.error) {
          console.error(result.error);
        } else {
          console.log(result.value);
        }
      } else if (sub === "delete") {
        const key = rest[1];
        if (!key) {
          console.error("Usage: kickd vars delete <key>");
          process.exit(1);
        }
        await request(`/variables/${key}`, { method: "DELETE" });
        console.log(`Deleted variable: ${key}`);
      }
      break;
    }

    // ── Queue ──

    case "queue": {
      const stats = await request("/queue/stats");
      console.log("\nTask queue:");
      console.log(`  Active:      ${stats.active}`);
      console.log(`  Pending:     ${stats.pending}`);
      console.log(`  Concurrency: ${stats.concurrency}`);
      console.log(`  Max size:    ${stats.maxSize}`);
      break;
    }

    // ── Plugins ──

    case "install": {
      const pkg = rest[0];
      if (!pkg) {
        console.error("Usage: kickd install <package-name>");
        process.exit(1);
      }
      console.log(`Installing plugin: ${pkg}...`);
      const result = await request("/plugins/install", {
        method: "POST",
        body: JSON.stringify({ package: pkg }),
      });
      if (result.success) {
        console.log(`Installed! Skills: ${result.skills.join(", ") || "none registered"}`);
      } else {
        console.error(`Failed: ${result.error}`);
      }
      break;
    }

    case "uninstall": {
      const pkg = rest[0];
      if (!pkg) {
        console.error("Usage: kickd uninstall <package-name>");
        process.exit(1);
      }
      console.log(`Uninstalling plugin: ${pkg}...`);
      const result = await request("/plugins/uninstall", {
        method: "POST",
        body: JSON.stringify({ package: pkg }),
      });
      if (result.success) {
        console.log("Uninstalled.");
      } else {
        console.error(`Failed: ${result.error}`);
      }
      break;
    }

    case "plugins": {
      const plugins = await request("/plugins");
      if (plugins.length === 0) {
        console.log("No plugins installed.");
      } else {
        console.log("\nInstalled plugins:");
        for (const p of plugins) {
          const skillIds = JSON.parse(p.skills);
          console.log(`  ${p.name}@${p.version} (skills: ${skillIds.join(", ") || "none"})`);
        }
      }
      break;
    }

    // ── Claude ──

    case "ask": {
      const prompt = rest.join(" ");
      if (!prompt) {
        console.error("Usage: kickd ask <prompt>");
        process.exit(1);
      }
      console.log("Asking Claude...");
      const result = await request("/claude", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      console.log(result.output);
      break;
    }

    // ── Stats & Health ──

    case "stats": {
      const stats = await request("/stats");
      console.log("\nGlobal stats:");
      console.log(`  Task runs:  ${stats.total_task_runs} (${stats.task_successes} ok, ${stats.task_failures} failed)`);
      console.log(`  Skill runs: ${stats.total_skill_runs} (${stats.skill_successes} ok, ${stats.skill_failures} failed)`);
      console.log(`  Events:     ${stats.total_events}`);
      console.log(`  Webhooks:   ${stats.active_webhooks} active`);
      break;
    }

    case "health": {
      const data = await request("/health");
      console.log(`Status: ${data.status}, Uptime: ${Math.round(data.uptime)}s`);
      if (data.checks) {
        for (const check of data.checks) {
          const icon = check.status === "healthy" ? "OK" : check.status === "degraded" ? "WARN" : "FAIL";
          const latency = check.latencyMs ? ` (${Math.round(check.latencyMs)}ms)` : "";
          console.log(`  [${icon}] ${check.name}${latency} ${check.message ?? ""}`);
        }
      }
      break;
    }

    default:
      console.log(`
kickd - Background automation daemon

Usage:
  kickd <command> [args]

Tasks:
  list                              List all registered tasks
  run <id> [json]                   Run a task by ID
  history <id>                      Show task run history

Skills:
  skills                            List all registered skills
  skill <id> [json]                 Run a skill with optional JSON input
  history <id> --skill              Show skill run history

Credentials:
  creds list                        List stored credentials
  creds types                       List available credential types
  creds add <name> <type> <json>    Store a credential
  creds get <name>                  View credential (redacted)
  creds test <name>                 Test credential connectivity
  creds delete <name>               Delete a credential

Webhooks:
  webhook list                      List webhooks
  webhook create <name> <type>:<id> Create a webhook
  webhook delete <id>               Delete a webhook

Events:
  events                            Show recent events
  events rules                      List event rules
  events add <event> <action>:<id>  Add a rule
  events delete <rule-id>           Delete a rule

Workflows:
  workflow list                     List workflows
  workflow run <id> [json]          Run a workflow
  workflow delete <id>              Delete a workflow

Variables:
  vars list [scope]                 List variables
  vars set <key> <value>            Set a variable
  vars get <key>                    Get a variable
  vars delete <key>                 Delete a variable

Queue:
  queue                             Show queue stats

Notifications:
  notify list                       List notification channels
  notify add <type> <url> [events]  Add a channel
  notify delete <id>                Delete a channel

Plugins:
  install <package>                 Install a plugin from npm
  uninstall <package>               Uninstall a plugin
  plugins                           List installed plugins

Other:
  ask <prompt>                      Ask Claude Code a question
  stats                             Show global statistics
  health                            Check daemon health

The daemon is started with: bun run start
MCP mode is started with: bun run mcp
`);
  }
}

main().catch((err) => {
  if (err.code === "ConnectionRefused" || err.message?.includes("fetch")) {
    console.error("Could not connect to kickd daemon. Is it running? Start with: bun run start");
  } else {
    console.error(err);
  }
  process.exit(1);
});
