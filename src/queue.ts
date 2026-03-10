import { logger } from "./logger";

const log = logger.child("queue");

interface QueueItem<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  addedAt: number;
}

interface QueueConfig {
  concurrency: number;
  maxSize: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 5,
  maxSize: 1000,
};

export class TaskQueue {
  private queue: QueueItem<unknown>[] = [];
  private running = 0;
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async add<T>(id: string, fn: () => Promise<T>, priority = 0): Promise<T> {
    if (this.queue.length >= this.config.maxSize) {
      throw new Error(`Queue is full (max ${this.config.maxSize})`);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        addedAt: Date.now(),
      });

      // Sort by priority (higher = first), then by addedAt (earlier = first)
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.addedAt - b.addedAt;
      });

      this.process();
    });
  }

  private async process() {
    while (this.running < this.config.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;

      log.debug("Processing queue item", { id: item.id, queueSize: this.queue.length });

      item.fn()
        .then((result) => {
          item.resolve(result);
        })
        .catch((err) => {
          item.reject(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }

  get pending(): number {
    return this.queue.length;
  }

  clear() {
    for (const item of this.queue) {
      item.reject(new Error("Queue cleared"));
    }
    this.queue = [];
  }

  stats() {
    return {
      active: this.running,
      pending: this.queue.length,
      concurrency: this.config.concurrency,
      maxSize: this.config.maxSize,
    };
  }
}

export const taskQueue = new TaskQueue({
  concurrency: Number(process.env.KICKD_QUEUE_CONCURRENCY ?? 5),
  maxSize: Number(process.env.KICKD_QUEUE_MAX_SIZE ?? 1000),
});
