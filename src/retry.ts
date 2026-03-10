export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt: number, config: RetryConfig): number {
  const base = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(base, config.maxDelayMs);
  // Add 0-25% jitter
  const jitter = capped * Math.random() * 0.25;
  return capped + jitter;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < config.maxAttempts - 1) {
        const delay = computeDelay(attempt, config);
        onRetry?.(attempt + 1, lastError, delay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
