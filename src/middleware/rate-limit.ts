import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,  // 1 minute
  maxRequests: 100,   // 100 requests per minute
};

const store = new Map<string, RateLimitEntry>();

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);

export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    // Skip rate limiting if disabled
    if (process.env.KICKD_RATE_LIMIT === "false") {
      return next();
    }

    // Skip health checks
    if (c.req.path === "/health") {
      return next();
    }

    const key = getClientKey(c);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Rate limit exceeded", retryAfter },
        429
      );
    }

    return next();
  };
}

function getClientKey(c: Context): string {
  // Use X-Forwarded-For if behind a proxy, otherwise use the connection info
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // Fallback to a generic key for localhost
  return c.req.header("Host") ?? "localhost";
}
