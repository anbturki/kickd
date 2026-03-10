import { resolveCredential, updateCredential } from "./store";
import type { Credential } from "./types";
import { logger } from "../logger";

const log = logger.child("oauth2");

interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// Generate an OAuth2 authorization URL
export function getAuthorizationUrl(params: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
}): string {
  const url = new URL(params.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  if (params.scope) url.searchParams.set("scope", params.scope);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

// Exchange authorization code for tokens
export async function exchangeCode(params: {
  tokenUrl: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuth2TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(params.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${error}`);
  }

  return response.json();
}

// Refresh an access token using a refresh token
export async function refreshAccessToken(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuth2TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });

  const response = await fetch(params.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${error}`);
  }

  return response.json();
}

// Refresh a stored credential's access token
export async function refreshCredentialToken(credentialNameOrId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const credential = resolveCredential(credentialNameOrId);
  if (!credential) {
    return { success: false, error: "Credential not found" };
  }

  const { clientId, clientSecret, refreshToken, tokenUrl } = credential.data as Record<string, string>;

  if (!tokenUrl || !clientId || !clientSecret || !refreshToken) {
    return { success: false, error: "Missing OAuth2 fields (tokenUrl, clientId, clientSecret, refreshToken)" };
  }

  try {
    const tokens = await refreshAccessToken({
      tokenUrl,
      clientId,
      clientSecret,
      refreshToken,
    });

    const updatedData = { ...credential.data };
    updatedData.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      updatedData.refreshToken = tokens.refresh_token;
    }
    if (tokens.expires_in) {
      updatedData.expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    }

    updateCredential(credential.id, { data: updatedData });

    log.info("Refreshed OAuth2 token", { credential: credential.name });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("Token refresh failed", { credential: credential.name, error });
    return { success: false, error };
  }
}

// Check if a credential's token is expired or about to expire
export function isTokenExpired(credential: Credential, bufferSeconds = 300): boolean {
  const expiresAt = credential.data.expiresAt as string | undefined;
  if (!expiresAt) return false; // No expiry info, assume valid

  const expiry = new Date(expiresAt).getTime();
  return Date.now() + bufferSeconds * 1000 > expiry;
}

// Resolve a credential with auto-refresh if expired
export async function resolveWithAutoRefresh(credentialNameOrId: string): Promise<Credential | null> {
  const credential = resolveCredential(credentialNameOrId);
  if (!credential) return null;

  if (isTokenExpired(credential)) {
    log.info("Token expired, refreshing", { credential: credential.name });
    const result = await refreshCredentialToken(credentialNameOrId);
    if (result.success) {
      return resolveCredential(credentialNameOrId);
    }
    log.warn("Auto-refresh failed, returning stale token", { credential: credential.name });
  }

  return credential;
}

// Pending OAuth2 flows (state -> metadata)
const pendingFlows = new Map<string, {
  credentialName: string;
  typeId: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  createdAt: number;
}>();

// Clean up expired flows (15 min timeout)
setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [state, flow] of pendingFlows) {
    if (flow.createdAt < cutoff) {
      pendingFlows.delete(state);
    }
  }
}, 60_000);

export function startOAuth2Flow(params: {
  credentialName: string;
  typeId: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
}): { authUrl: string; state: string } {
  const state = crypto.randomUUID();

  pendingFlows.set(state, {
    credentialName: params.credentialName,
    typeId: params.typeId,
    tokenUrl: params.tokenUrl,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    redirectUri: params.redirectUri,
    createdAt: Date.now(),
  });

  const authUrl = getAuthorizationUrl({
    authorizeUrl: params.authorizeUrl,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    state,
  });

  return { authUrl, state };
}

export function getPendingFlow(state: string) {
  return pendingFlows.get(state);
}

export function removePendingFlow(state: string) {
  pendingFlows.delete(state);
}
