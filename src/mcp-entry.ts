import { startMcpServer } from "./mcp/server";
import { loadTasks } from "./tasks/loader";
import { loadSkills } from "./skills/loader";

async function main() {
  await loadSkills();
  await loadTasks();
  await startMcpServer();
}

main();
