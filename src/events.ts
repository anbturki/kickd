import { logEvent, getActiveEventRules } from "./db";
import { logger } from "./logger";

const log = logger.child("events");

export interface KickdEvent {
  type: string;
  sourceType: "task" | "skill" | "webhook" | "system";
  sourceId: string;
  payload?: Record<string, unknown>;
}

type EventHandler = (event: KickdEvent) => void | Promise<void>;

class EventBus {
  private listeners = new Map<string, EventHandler[]>();
  private globalListeners: EventHandler[] = [];
  private maxDepth = 10;
  private currentDepth = 0;

  on(eventType: string, handler: EventHandler) {
    const handlers = this.listeners.get(eventType) ?? [];
    handlers.push(handler);
    this.listeners.set(eventType, handlers);
  }

  onAll(handler: EventHandler) {
    this.globalListeners.push(handler);
  }

  off(eventType: string, handler: EventHandler) {
    const handlers = this.listeners.get(eventType);
    if (!handlers) return;
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  }

  async emit(event: KickdEvent) {
    if (this.currentDepth >= this.maxDepth) {
      log.warn(`Event depth limit (${this.maxDepth}) reached, dropping: ${event.type} from ${event.sourceId}`);
      return;
    }

    this.currentDepth++;

    try {
      // Log to database
      logEvent(event.type, event.sourceType, event.sourceId, event.payload);

      // Run global listeners
      for (const handler of this.globalListeners) {
        try {
          await handler(event);
        } catch (err) {
          log.error(`Global event handler error for ${event.type}`, { error: err instanceof Error ? (err as Error).message : String(err) });
        }
      }

      // Run type-specific listeners
      const handlers = this.listeners.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            log.error(`Event handler error for ${event.type}`, { error: err instanceof Error ? (err as Error).message : String(err) });
          }
        }
      }
    } finally {
      this.currentDepth--;
    }
  }
}

export const eventBus = new EventBus();

// ── Event Rule Executor ──
// Loaded at startup, reacts to events based on rules in the database

export function initEventRules(
  runTask: (taskId: string, params?: Record<string, unknown>) => Promise<unknown>,
  runSkill: (skillId: string, input: unknown) => Promise<unknown>
) {
  eventBus.onAll(async (event) => {
    const rules = getActiveEventRules();

    for (const rule of rules) {
      if (rule.event_type !== event.type) continue;
      if (rule.source_id && rule.source_id !== event.sourceId) continue;

      const input = rule.action_input ? JSON.parse(rule.action_input) : {};

      try {
        switch (rule.action_type) {
          case "run_task":
            await runTask(rule.target_id, input);
            break;
          case "run_skill":
            await runSkill(rule.target_id, input);
            break;
          default:
            log.warn(`Unknown event rule action: ${rule.action_type}`);
        }
      } catch (err) {
        log.error(`Event rule ${rule.id} failed`, { error: err instanceof Error ? (err as Error).message : String(err) });
      }
    }
  });
}
