import type { z } from "zod";
import { startSkillRun, finishSkillRun, getSkillHistory } from "../db";
import { eventBus } from "../events";
import { logger } from "../logger";

const log = logger.child("skills");

interface SkillDefinition<TInput extends z.ZodType, TOutput extends z.ZodType> {
  id: string;
  name: string;
  description: string;
  input: TInput;
  output: TOutput;
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

interface RegisteredSkill {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
  validate: (input: unknown) => { success: boolean; data?: unknown; error?: string };
}

class SkillEngine {
  private skills = new Map<string, RegisteredSkill>();

  register<TInput extends z.ZodType, TOutput extends z.ZodType>(
    definition: SkillDefinition<TInput, TOutput>
  ) {
    const registered: RegisteredSkill = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      inputSchema: zodToJsonSchema(definition.input),
      outputSchema: zodToJsonSchema(definition.output),
      validate: (input: unknown) => {
        const result = definition.input.safeParse(input);
        if (result.success) return { success: true, data: result.data };
        return { success: false, error: String(result.error) };
      },
      execute: async (input: unknown) => {
        const parsed = definition.input.parse(input);
        return definition.execute(parsed);
      },
    };

    this.skills.set(definition.id, registered);
    log.info(`Registered skill: ${definition.name}`);
  }

  async run(skillId: string, input: unknown, chainId?: string): Promise<{ success: boolean; output: unknown; error?: string }> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, output: null, error: `Skill "${skillId}" not found` };
    }

    const validation = skill.validate(input);
    if (!validation.success) {
      return { success: false, output: null, error: `Invalid input: ${validation.error}` };
    }

    const runId = startSkillRun(skillId, input, chainId);
    const start = performance.now();

    try {
      const output = await skill.execute(validation.data);
      const duration = performance.now() - start;

      finishSkillRun(runId, "completed", output, null, duration);

      eventBus.emit({
        type: "skill.completed",
        sourceType: "skill",
        sourceId: skillId,
        payload: { output, duration },
      });

      return { success: true, output };
    } catch (err) {
      const duration = performance.now() - start;
      const error = err instanceof Error ? err.message : String(err);

      finishSkillRun(runId, "failed", null, error, duration);

      eventBus.emit({
        type: "skill.failed",
        sourceType: "skill",
        sourceId: skillId,
        payload: { error, duration },
      });

      return { success: false, output: null, error };
    }
  }

  async chain(steps: Array<{ skillId: string; mapInput?: (prev: unknown) => unknown }>): Promise<{
    success: boolean;
    output: unknown;
    error?: string;
    step?: number;
  }> {
    let prevOutput: unknown = {};
    const chainId = crypto.randomUUID();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const input = step.mapInput ? step.mapInput(prevOutput) : prevOutput;
      const result = await this.run(step.skillId, input, chainId);

      if (!result.success) {
        return { success: false, output: result.output, error: result.error, step: i };
      }

      prevOutput = result.output;
    }

    return { success: true, output: prevOutput };
  }

  list(): Array<{ id: string; name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Array.from(this.skills.values()).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }));
  }

  get(skillId: string): RegisteredSkill | undefined {
    return this.skills.get(skillId);
  }

  history(skillId: string, limit = 20) {
    return getSkillHistory(skillId, limit);
  }

  unregister(skillId: string) {
    this.skills.delete(skillId);
  }
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    if ("shape" in schema && typeof schema.shape === "object") {
      const shape = schema.shape as Record<string, z.ZodType>;
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = { type: getZodTypeName(value), description: value.description ?? "" };
      }
      return { type: "object", properties };
    }
  } catch {
    // fallback
  }
  return { type: "unknown" };
}

function getZodTypeName(schema: z.ZodType): string {
  // Zod v4: check _zod.def.type
  const zod = (schema as Record<string, unknown>)._zod as Record<string, unknown> | undefined;
  if (zod?.def && typeof zod.def === "object") {
    const def = zod.def as Record<string, unknown>;
    if (typeof def.type === "string") return def.type;
  }

  // Zod v3 fallback: _def.typeName
  const _def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (_def?.typeName && typeof _def.typeName === "string") {
    return _def.typeName.replace("Zod", "").toLowerCase();
  }

  // Direct property checks
  if ("innerType" in schema) return "optional";
  if ("shape" in schema) return "object";
  if ("element" in schema) return "array";

  return "string";
}

export { SkillEngine };
export const skills = new SkillEngine();
