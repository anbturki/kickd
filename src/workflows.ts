import { skills } from "./skills/engine";
import { registry } from "./tasks/registry";
import { eventBus } from "./events";
import { logger } from "./logger";

const log = logger.child("workflows");

export interface WorkflowStep {
  id: string;
  type: "task" | "skill" | "condition" | "delay" | "parallel";
  // task/skill target
  targetId?: string;
  // input mapping: template strings with {{prev.field}} or {{steps.stepId.field}}
  input?: Record<string, unknown>;
  // condition step: JS expression evaluated against context
  condition?: string;
  // condition branches
  onTrue?: string; // step ID to go to if true
  onFalse?: string; // step ID to go to if false
  // delay in ms
  delayMs?: number;
  // parallel sub-steps
  parallel?: string[]; // step IDs to run in parallel
  // next step (for linear flow)
  next?: string;
  // continue on failure
  continueOnError?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger?: {
    type: "cron" | "event" | "webhook" | "manual";
    value?: string; // cron expression, event type, or webhook ID
  };
  steps: WorkflowStep[];
  startStep: string;
}

interface StepResult {
  stepId: string;
  success: boolean;
  output: unknown;
  error?: string;
  duration: number;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  steps: StepResult[];
  totalDuration: number;
}

class WorkflowEngine {
  private workflows = new Map<string, WorkflowDefinition>();

  register(workflow: WorkflowDefinition) {
    this.workflows.set(workflow.id, workflow);
    log.info("Registered workflow", { id: workflow.id, name: workflow.name });
  }

  unregister(workflowId: string) {
    this.workflows.delete(workflowId);
  }

  get(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  list() {
    return Array.from(this.workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      trigger: w.trigger,
      stepCount: w.steps.length,
    }));
  }

  async run(workflowId: string, initialInput?: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return {
        workflowId,
        success: false,
        steps: [],
        totalDuration: 0,
      };
    }

    const start = performance.now();
    const stepMap = new Map(workflow.steps.map((s) => [s.id, s]));
    const stepResults = new Map<string, StepResult>();
    const results: StepResult[] = [];

    eventBus.emit({
      type: "workflow.started",
      sourceType: "system",
      sourceId: workflowId,
      payload: { name: workflow.name },
    });

    let currentStepId: string | undefined = workflow.startStep;
    let prevOutput: unknown = initialInput ?? {};

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) {
        log.error("Step not found in workflow", { workflowId, stepId: currentStepId });
        break;
      }

      const stepStart = performance.now();
      let stepResult: StepResult;

      try {
        const resolvedInput = resolveInput(step.input ?? {}, prevOutput, stepResults);

        switch (step.type) {
          case "task": {
            const result = await registry.run(step.targetId!, resolvedInput);
            stepResult = {
              stepId: step.id,
              success: result.success,
              output: result.output,
              duration: performance.now() - stepStart,
            };
            break;
          }

          case "skill": {
            const result = await skills.run(step.targetId!, resolvedInput);
            stepResult = {
              stepId: step.id,
              success: result.success,
              output: result.output,
              error: result.error,
              duration: performance.now() - stepStart,
            };
            break;
          }

          case "condition": {
            const conditionResult = evaluateCondition(step.condition!, prevOutput, stepResults);
            stepResult = {
              stepId: step.id,
              success: true,
              output: conditionResult,
              duration: performance.now() - stepStart,
            };
            currentStepId = conditionResult ? step.onTrue : step.onFalse;
            stepResults.set(step.id, stepResult);
            results.push(stepResult);
            continue; // skip normal next assignment
          }

          case "delay": {
            await new Promise((resolve) => setTimeout(resolve, step.delayMs ?? 1000));
            stepResult = {
              stepId: step.id,
              success: true,
              output: { delayed: step.delayMs },
              duration: performance.now() - stepStart,
            };
            break;
          }

          case "parallel": {
            const parallelResults = await Promise.allSettled(
              (step.parallel ?? []).map(async (subStepId) => {
                const subStep = stepMap.get(subStepId);
                if (!subStep) throw new Error(`Sub-step ${subStepId} not found`);
                return executeStep(subStep, prevOutput, stepResults);
              })
            );

            const subResults: StepResult[] = [];
            let allSuccess = true;
            for (let i = 0; i < parallelResults.length; i++) {
              const pr = parallelResults[i];
              const subStepId = step.parallel![i];
              if (pr.status === "fulfilled") {
                subResults.push(pr.value);
                stepResults.set(subStepId, pr.value);
                if (!pr.value.success) allSuccess = false;
              } else {
                const failResult: StepResult = {
                  stepId: subStepId,
                  success: false,
                  output: null,
                  error: pr.reason?.message ?? String(pr.reason),
                  duration: 0,
                };
                subResults.push(failResult);
                stepResults.set(subStepId, failResult);
                allSuccess = false;
              }
            }

            results.push(...subResults);
            stepResult = {
              stepId: step.id,
              success: allSuccess,
              output: subResults.map((r) => r.output),
              duration: performance.now() - stepStart,
            };
            break;
          }

          default:
            stepResult = {
              stepId: step.id,
              success: false,
              output: null,
              error: `Unknown step type: ${step.type}`,
              duration: 0,
            };
        }
      } catch (err) {
        stepResult = {
          stepId: step.id,
          success: false,
          output: null,
          error: err instanceof Error ? err.message : String(err),
          duration: performance.now() - stepStart,
        };
      }

      stepResults.set(step.id, stepResult);
      results.push(stepResult);
      prevOutput = stepResult.output;

      if (!stepResult.success && !step.continueOnError) {
        log.error("Workflow step failed", { workflowId, stepId: step.id, error: stepResult.error });
        break;
      }

      currentStepId = step.next;
    }

    const totalDuration = performance.now() - start;
    const allSuccess = results.every((r) => r.success);

    eventBus.emit({
      type: allSuccess ? "workflow.completed" : "workflow.failed",
      sourceType: "system",
      sourceId: workflowId,
      payload: { name: workflow.name, totalDuration, steps: results.length },
    });

    return {
      workflowId,
      success: allSuccess,
      steps: results,
      totalDuration,
    };
  }
}

async function executeStep(
  step: WorkflowStep,
  prevOutput: unknown,
  stepResults: Map<string, StepResult>
): Promise<StepResult> {
  const start = performance.now();
  const resolvedInput = resolveInput(step.input ?? {}, prevOutput, stepResults);

  if (step.type === "task") {
    const result = await registry.run(step.targetId!, resolvedInput);
    return { stepId: step.id, success: result.success, output: result.output, duration: performance.now() - start };
  }

  if (step.type === "skill") {
    const result = await skills.run(step.targetId!, resolvedInput);
    return { stepId: step.id, success: result.success, output: result.output, error: result.error, duration: performance.now() - start };
  }

  return { stepId: step.id, success: false, output: null, error: `Cannot execute ${step.type} in parallel`, duration: 0 };
}

function resolveInput(
  input: Record<string, unknown>,
  prevOutput: unknown,
  stepResults: Map<string, StepResult>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      resolved[key] = value.replace(/\{\{(.*?)\}\}/g, (_match, path: string) => {
        const trimmed = path.trim();

        if (trimmed.startsWith("prev.")) {
          const field = trimmed.slice(5);
          return getNestedValue(prevOutput, field) ?? "";
        }

        if (trimmed.startsWith("steps.")) {
          const parts = trimmed.slice(6).split(".");
          const stepId = parts[0];
          const field = parts.slice(1).join(".");
          const stepResult = stepResults.get(stepId);
          if (stepResult) {
            return getNestedValue(stepResult.output, field) ?? "";
          }
          return "";
        }

        return "";
      });
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

function getNestedValue(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }

  return current != null ? String(current) : "";
}

function evaluateCondition(
  condition: string,
  prevOutput: unknown,
  stepResults: Map<string, StepResult>
): boolean {
  // Simple condition evaluator — supports comparisons like "prev.success == true"
  const resolved = condition.replace(/\{\{(.*?)\}\}/g, (_match, path: string) => {
    const trimmed = path.trim();
    if (trimmed.startsWith("prev.")) {
      return JSON.stringify(getNestedValue(prevOutput, trimmed.slice(5)));
    }
    if (trimmed.startsWith("steps.")) {
      const parts = trimmed.slice(6).split(".");
      const stepId = parts[0];
      const field = parts.slice(1).join(".");
      const stepResult = stepResults.get(stepId);
      return JSON.stringify(stepResult ? getNestedValue(stepResult.output, field) : null);
    }
    return "null";
  });

  try {
    // Safe evaluation of simple boolean expressions
    return Boolean(new Function(`return (${resolved})`)());
  } catch {
    log.warn("Condition evaluation failed", { condition: resolved });
    return false;
  }
}

export const workflows = new WorkflowEngine();
