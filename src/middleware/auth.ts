import type { Context, Next } from "hono";

const SKIP_PATHS = ["/health"];

export async function authMiddleware(c: Context, next: Next) {
  const token = process.env.KICKD_API_TOKEN;

  // If no token is configured, auth is disabled
  if (!token) {
    return next();
  }

  // Skip auth for certain paths
  if (SKIP_PATHS.includes(c.req.path)) {
    return next();
  }

  // Webhook endpoints use their own HMAC auth
  if (c.req.path.startsWith("/hooks/") && c.req.method === "POST") {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return c.json({ error: "Invalid authorization format. Use: Bearer <token>" }, 401);
  }

  if (match[1] !== token) {
    return c.json({ error: "Invalid token" }, 403);
  }

  return next();
}
