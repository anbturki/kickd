import { readdir } from "fs/promises";
import { join } from "path";

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
        console.error(`  Failed to load skill ${file}:`, err);
      }
    }
  } catch {
    console.log("  No skills directory found, creating it...");
    await Bun.write(join(SKILLS_DIR, ".gitkeep"), "");
  }
}
