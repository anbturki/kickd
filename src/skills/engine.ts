import type { z } from "zod";

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
    console.log(`  Registered skill: ${definition.name}`);
  }

  async run(skillId: string, input: unknown): Promise<{ success: boolean; output: unknown; error?: string }> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, output: null, error: `Skill "${skillId}" not found` };
    }

    const validation = skill.validate(input);
    if (!validation.success) {
      return { success: false, output: null, error: `Invalid input: ${validation.error}` };
    }

    try {
      const output = await skill.execute(validation.data);
      return { success: true, output };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error };
    }
  }

  // Chain multiple skills: output of one feeds into the next
  async chain(steps: Array<{ skillId: string; mapInput?: (prev: unknown) => unknown }>): Promise<{
    success: boolean;
    output: unknown;
    error?: string;
    step?: number;
  }> {
    let prevOutput: unknown = {};

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const input = step.mapInput ? step.mapInput(prevOutput) : prevOutput;
      const result = await this.run(step.skillId, input);

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
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Lightweight schema extraction for display purposes
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
  const typeName = (schema as Record<string, unknown>)._zpiType ?? (schema as Record<string, unknown>)._type;
  if (typeof typeName === "string") return typeName;
  if ("innerType" in schema) return "optional";
  return "unknown";
}

export const skills = new SkillEngine();
