import { savePlugin, removePlugin, getPlugins } from "./db";
import { skills } from "./skills/engine";
import { logger } from "./logger";

const log = logger.child("plugins");

export async function installPlugin(packageName: string): Promise<{ success: boolean; skills: string[]; error?: string }> {
  // Install via bun
  const proc = Bun.spawn(["bun", "add", packageName], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return { success: false, skills: [], error: `Install failed: ${stderr}` };
  }

  // Try to import and register
  try {
    const mod = await import(packageName);

    // Convention 1: exports a register(skills) function
    if (typeof mod.register === "function") {
      const beforeIds = new Set(skills.list().map((s) => s.id));
      mod.register(skills);
      const afterIds = skills.list().map((s) => s.id);
      const newSkills = afterIds.filter((id) => !beforeIds.has(id));

      // Get version from package.json
      const version = mod.version ?? "unknown";
      savePlugin(packageName, version, newSkills);
      return { success: true, skills: newSkills };
    }

    // Convention 2: exports a skills array of skill definitions
    if (Array.isArray(mod.skills)) {
      const newSkills: string[] = [];
      for (const def of mod.skills) {
        skills.register(def);
        newSkills.push(def.id);
      }
      const version = mod.version ?? "unknown";
      savePlugin(packageName, version, newSkills);
      return { success: true, skills: newSkills };
    }

    // Convention 3: auto-registers on import (like local skills)
    // Check if new skills appeared
    const allSkills = skills.list().map((s) => s.id);
    savePlugin(packageName, "unknown", []);
    return { success: true, skills: allSkills };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, skills: [], error: `Import failed: ${error}` };
  }
}

export async function uninstallPlugin(packageName: string): Promise<{ success: boolean; error?: string }> {
  // Get plugin record to find associated skills
  const plugins = getPlugins();
  const plugin = plugins.find((p) => p.name === packageName);

  if (plugin) {
    const skillIds: string[] = JSON.parse(plugin.skills);
    for (const id of skillIds) {
      skills.unregister(id);
    }
    removePlugin(packageName);
  }

  // Uninstall via bun
  const proc = Bun.spawn(["bun", "remove", packageName], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return { success: false, error: `Uninstall failed: ${stderr}` };
  }

  return { success: true };
}

export async function loadInstalledPlugins() {
  const plugins = getPlugins();

  for (const plugin of plugins) {
    try {
      const mod = await import(plugin.name);
      if (typeof mod.register === "function") {
        mod.register(skills);
      }
      log.info(`Loaded plugin: ${plugin.name}`);
    } catch (err) {
      log.error(`Failed to load plugin ${plugin.name}`, { error: err instanceof Error ? (err as Error).message : String(err) });
    }
  }
}
