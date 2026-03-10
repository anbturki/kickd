import { startMcpServer } from "./mcp/server";
import { loadTasks } from "./tasks/loader";
import { loadSkills } from "./skills/loader";
import { loadInstalledPlugins } from "./plugins";
import { initEventRules } from "./events";
import { registry } from "./tasks/registry";
import { skills } from "./skills/engine";

// Import db to ensure schema creation
import "./db";

async function main() {
  await loadSkills();
  await loadInstalledPlugins();
  await loadTasks();

  initEventRules(
    (taskId, params) => registry.run(taskId, params),
    (skillId, input) => skills.run(skillId, input)
  );

  await startMcpServer();
}

main();
