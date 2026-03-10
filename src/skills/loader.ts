import { readdir } from "fs/promises";
import { join } from "path";
import { logger } from "../logger";

const log = logger.child("loader");

const SKILLS_DIR = join(import.meta.dir, "..", "..", "skills");

export async function loadSkills() {
  try {
    const files = await readdir(SKILLS_DIR);
    const skillFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of skillFiles) {
      const modulePath = join(SKILLS_DIR, file);
      try {
        await import(modulePath); // skills self-register on import
      } catch (err) {
        log.error(`Failed to load skill ${file}`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch {
    log.info("No skills directory found, creating it...");
    await Bun.write(join(SKILLS_DIR, ".gitkeep"), "");
  }
}
