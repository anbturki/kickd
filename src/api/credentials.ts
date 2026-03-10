import { Hono } from "hono";
import {
  getCredentialTypes,
  getCredentialType,
  createCredential,
  listCredentials,
  resolveCredential,
  updateCredential,
  deleteCredential,
  testCredential,
  getCredentialAudit,
  buildAuthHeaders,
} from "../credentials/store";
import {
  startOAuth2Flow,
  exchangeCode,
  getPendingFlow,
  removePendingFlow,
} from "../credentials/oauth2";

export const credentialRoutes = new Hono();

// ── Credential Types ──

credentialRoutes.get("/types", (c) => {
  return c.json(getCredentialTypes());
});

credentialRoutes.get("/types/:id", (c) => {
  const type = getCredentialType(c.req.param("id"));
  if (!type) return c.json({ error: "Credential type not found" }, 404);
  return c.json(type);
});

// ── Credentials CRUD ──

credentialRoutes.get("/", (c) => {
  return c.json(listCredentials());
});

credentialRoutes.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name || !body.typeId || !body.data) {
    return c.json({ error: "name, typeId, and data are required" }, 400);
  }

  try {
    const credential = createCredential({
      name: body.name,
      typeId: body.typeId,
      data: body.data,
      tags: body.tags,
    });
    return c.json(credential, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 400);
  }
});

credentialRoutes.get("/:id", (c) => {
  const cred = resolveCredential(c.req.param("id"));
  if (!cred) return c.json({ error: "Credential not found" }, 404);

  // Redact sensitive values in response
  const type = getCredentialType(cred.typeId);
  const sensitiveFields = new Set(
    type?.fields.filter((f) => f.sensitive).map((f) => f.name) ?? []
  );

  const redacted = { ...cred.data };
  for (const key of Object.keys(redacted)) {
    if (sensitiveFields.has(key)) {
      const value = String(redacted[key]);
      redacted[key] = value.length > 8
        ? value.slice(0, 4) + "****" + value.slice(-4)
        : "****";
    }
  }

  return c.json({ ...cred, data: redacted });
});

credentialRoutes.put("/:id", async (c) => {
  const body = await c.req.json();
  const updated = updateCredential(c.req.param("id"), {
    name: body.name,
    data: body.data,
    tags: body.tags,
  });

  if (!updated) return c.json({ error: "Credential not found" }, 404);
  return c.json({ updated: true });
});

credentialRoutes.delete("/:id", (c) => {
  const deleted = deleteCredential(c.req.param("id"));
  if (!deleted) return c.json({ error: "Credential not found" }, 404);
  return c.json({ deleted: true });
});

// ── Test ──

credentialRoutes.post("/:id/test", async (c) => {
  const result = await testCredential(c.req.param("id"));
  return c.json(result, result.success ? 200 : 400);
});

// ── Audit ──

credentialRoutes.get("/:id/audit", (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  return c.json(getCredentialAudit(c.req.param("id"), limit));
});

// ── OAuth2 Flow ──

credentialRoutes.post("/oauth2/start", async (c) => {
  const body = await c.req.json();

  if (!body.credentialName || !body.typeId || !body.authorizeUrl || !body.tokenUrl || !body.clientId || !body.clientSecret || !body.redirectUri) {
    return c.json({ error: "credentialName, typeId, authorizeUrl, tokenUrl, clientId, clientSecret, and redirectUri are required" }, 400);
  }

  const { authUrl, state } = startOAuth2Flow({
    credentialName: body.credentialName,
    typeId: body.typeId,
    authorizeUrl: body.authorizeUrl,
    tokenUrl: body.tokenUrl,
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    redirectUri: body.redirectUri,
    scope: body.scope,
  });

  return c.json({ authUrl, state });
});

credentialRoutes.get("/oauth2/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.json({ error: `OAuth2 authorization denied: ${error}` }, 400);
  }

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const flow = getPendingFlow(state);
  if (!flow) {
    return c.json({ error: "Unknown or expired OAuth2 flow" }, 400);
  }

  try {
    const tokens = await exchangeCode({
      tokenUrl: flow.tokenUrl,
      code,
      clientId: flow.clientId,
      clientSecret: flow.clientSecret,
      redirectUri: flow.redirectUri,
    });

    const data: Record<string, string> = {
      clientId: flow.clientId,
      clientSecret: flow.clientSecret,
      tokenUrl: flow.tokenUrl,
      accessToken: tokens.access_token,
    };
    if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
    if (tokens.expires_in) {
      data.expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    }

    const credential = createCredential({
      name: flow.credentialName,
      typeId: flow.typeId,
      data,
    });

    removePendingFlow(state);

    return c.json({ success: true, credentialId: credential.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});
