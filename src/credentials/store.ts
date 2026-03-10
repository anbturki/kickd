import { db } from "../db";
import { encryptFields, decryptFields, hasEncryptionKey, type EncryptedBlob } from "./crypto";
import { builtinCredentialTypes } from "./builtin-types";
import { logger } from "../logger";
import type {
  CredentialTypeDefinition,
  StoredCredential,
  Credential,
  CredentialSummary,
  CredentialField,
} from "./types";

const log = logger.child("credentials");

// Ensure credential table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type_id TEXT NOT NULL,
    public_data TEXT NOT NULL DEFAULT '{}',
    encrypted_blob TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS credential_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    auth_type TEXT NOT NULL,
    fields_schema TEXT NOT NULL,
    test_endpoint TEXT,
    category TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credential_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_credentials_name ON credentials(name);
  CREATE INDEX IF NOT EXISTS idx_credentials_type_id ON credentials(type_id);
  CREATE INDEX IF NOT EXISTS idx_credential_audit_cred_id ON credential_audit(credential_id);
`);

// ── Credential Type Registry ──

const typeRegistry = new Map<string, CredentialTypeDefinition>();

// Load builtin types
for (const type of builtinCredentialTypes) {
  typeRegistry.set(type.id, type);
}

export function getCredentialTypes(): CredentialTypeDefinition[] {
  return Array.from(typeRegistry.values());
}

export function getCredentialType(typeId: string): CredentialTypeDefinition | undefined {
  return typeRegistry.get(typeId);
}

export function registerCredentialType(type: CredentialTypeDefinition) {
  typeRegistry.set(type.id, type);

  db.prepare(`
    INSERT OR REPLACE INTO credential_types (id, name, description, auth_type, fields_schema, test_endpoint, category, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    type.id,
    type.name,
    type.description,
    type.authType,
    JSON.stringify(type.fields),
    type.testEndpoint ? JSON.stringify(type.testEndpoint) : null,
    type.category ?? null,
    new Date().toISOString()
  );
}

// ── CRUD Operations ──

const insertCredential = db.prepare(`
  INSERT INTO credentials (id, name, type_id, public_data, encrypted_blob, created_at, updated_at, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateCredentialStmt = db.prepare(`
  UPDATE credentials SET name = ?, public_data = ?, encrypted_blob = ?, updated_at = ?, tags = ?
  WHERE id = ?
`);

const queryCredentials = db.prepare(`SELECT * FROM credentials ORDER BY created_at DESC`);
const queryCredentialById = db.prepare(`SELECT * FROM credentials WHERE id = ?`);
const queryCredentialByName = db.prepare(`SELECT * FROM credentials WHERE name = ?`);
const deleteCredentialById = db.prepare(`DELETE FROM credentials WHERE id = ?`);

const insertAudit = db.prepare(`
  INSERT INTO credential_audit (credential_id, action, details, created_at)
  VALUES (?, ?, ?, ?)
`);

function audit(credentialId: string, action: string, details?: string) {
  insertAudit.run(credentialId, action, details ?? null, new Date().toISOString());
}

export function createCredential(params: {
  name: string;
  typeId: string;
  data: Record<string, unknown>;
  tags?: string[];
}): CredentialSummary {
  const type = typeRegistry.get(params.typeId);

  // Validate fields if type is known
  if (type) {
    validateFields(params.data, type.fields);
  }

  const sensitiveFields = type
    ? type.fields.filter((f) => f.sensitive).map((f) => f.name)
    : [];

  const id = crypto.randomUUID().slice(0, 12);
  const now = new Date().toISOString();

  if (hasEncryptionKey() && sensitiveFields.length > 0) {
    const { encrypted, blob } = encryptFields(params.data, sensitiveFields);
    insertCredential.run(
      id, params.name, params.typeId,
      JSON.stringify(encrypted),
      blob ? JSON.stringify(blob) : null,
      now, now,
      JSON.stringify(params.tags ?? [])
    );
  } else {
    // No encryption key — store as-is (warn in logs)
    if (sensitiveFields.length > 0 && !hasEncryptionKey()) {
      log.warn(`Storing credential "${params.name}" without encryption. Set KICKD_ENCRYPTION_KEY.`);
    }
    insertCredential.run(
      id, params.name, params.typeId,
      JSON.stringify(params.data),
      null, now, now,
      JSON.stringify(params.tags ?? [])
    );
  }

  audit(id, "created", `type=${params.typeId}`);

  return {
    id,
    name: params.name,
    typeId: params.typeId,
    createdAt: now,
    updatedAt: now,
    tags: params.tags ?? [],
  };
}

export function listCredentials(): CredentialSummary[] {
  const rows = queryCredentials.all() as StoredCredential[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    typeId: r.type_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tags: JSON.parse(r.tags),
  }));
}

export function resolveCredential(nameOrId: string): Credential | null {
  let row = queryCredentialByName.get(nameOrId) as StoredCredential | undefined;
  if (!row) {
    row = queryCredentialById.get(nameOrId) as StoredCredential | undefined;
  }
  if (!row) return null;

  const publicData = JSON.parse(row.public_data);
  const blob = row.encrypted_blob ? JSON.parse(row.encrypted_blob) as EncryptedBlob : null;

  let data: Record<string, unknown>;
  try {
    data = decryptFields(publicData, blob);
  } catch {
    // If decryption fails (wrong key?), return public data only
    data = publicData;
  }

  audit(row.id, "accessed");

  return {
    id: row.id,
    name: row.name,
    typeId: row.type_id,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: JSON.parse(row.tags),
  };
}

export function updateCredential(id: string, params: {
  name?: string;
  data?: Record<string, unknown>;
  tags?: string[];
}): boolean {
  const row = queryCredentialById.get(id) as StoredCredential | undefined;
  if (!row) return false;

  const name = params.name ?? row.name;
  const tags = params.tags ?? JSON.parse(row.tags);
  const now = new Date().toISOString();

  if (params.data) {
    const type = typeRegistry.get(row.type_id);
    const sensitiveFields = type
      ? type.fields.filter((f) => f.sensitive).map((f) => f.name)
      : [];

    if (hasEncryptionKey() && sensitiveFields.length > 0) {
      const { encrypted, blob } = encryptFields(params.data, sensitiveFields);
      updateCredentialStmt.run(
        name,
        JSON.stringify(encrypted),
        blob ? JSON.stringify(blob) : null,
        now,
        JSON.stringify(tags),
        id
      );
    } else {
      updateCredentialStmt.run(
        name,
        JSON.stringify(params.data),
        null,
        now,
        JSON.stringify(tags),
        id
      );
    }
  } else {
    updateCredentialStmt.run(name, row.public_data, row.encrypted_blob, now, JSON.stringify(tags), id);
  }

  audit(id, "updated");
  return true;
}

export function deleteCredential(id: string): boolean {
  const row = queryCredentialById.get(id) as StoredCredential | undefined;
  if (!row) return false;

  audit(id, "deleted");
  deleteCredentialById.run(id);
  return true;
}

export function getCredentialAudit(credentialId: string, limit = 50) {
  return db.prepare(`
    SELECT * FROM credential_audit WHERE credential_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(credentialId, limit);
}

// ── Auth Header Builders ──

export function buildAuthHeaders(credential: Credential): Record<string, string> {
  const type = typeRegistry.get(credential.typeId);
  const authType = type?.authType ?? "custom";

  switch (authType) {
    case "bearer": {
      const token = (credential.data.token ?? credential.data.botToken ?? credential.data.apiKey ?? credential.data.accessToken) as string;
      return { Authorization: `Bearer ${token}` };
    }
    case "api_key": {
      const key = (credential.data.key ?? credential.data.apiKey) as string;
      const headerName = (credential.data.headerName as string) ?? "X-API-Key";
      return { [headerName]: key };
    }
    case "basic_auth": {
      const username = credential.data.username as string;
      const password = credential.data.password as string;
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "oauth2": {
      const token = credential.data.accessToken as string;
      return { Authorization: `Bearer ${token}` };
    }
    default:
      return {};
  }
}

// ── Test Connection ──

export async function testCredential(nameOrId: string): Promise<{ success: boolean; message: string }> {
  const credential = resolveCredential(nameOrId);
  if (!credential) return { success: false, message: "Credential not found" };

  const type = typeRegistry.get(credential.typeId);
  if (!type?.testEndpoint) {
    return { success: false, message: `No test endpoint defined for type "${credential.typeId}"` };
  }

  const headers = buildAuthHeaders(credential);

  // Replace template variables in URL
  let url = type.testEndpoint.url;
  for (const [key, value] of Object.entries(credential.data)) {
    url = url.replace(`{{${key}}}`, String(value));
  }

  // Replace template variables in custom headers
  if (type.testEndpoint.headerTemplate) {
    for (const [hKey, hValue] of Object.entries(type.testEndpoint.headerTemplate)) {
      let resolved = hValue;
      for (const [key, value] of Object.entries(credential.data)) {
        resolved = resolved.replace(`{{${key}}}`, String(value));
      }
      headers[hKey] = resolved;
    }
  }

  try {
    const response = await fetch(url, {
      method: type.testEndpoint.method,
      headers,
    });

    if (response.ok) {
      audit(credential.id, "test_success");
      return { success: true, message: `Connection successful (${response.status})` };
    }

    audit(credential.id, "test_failed", `status=${response.status}`);
    return { success: false, message: `Connection failed (${response.status})` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    audit(credential.id, "test_failed", message);
    return { success: false, message };
  }
}

// ── Validation ──

function validateFields(data: Record<string, unknown>, fields: CredentialField[]) {
  for (const field of fields) {
    const value = data[field.name];

    if (field.required && (value === undefined || value === null || value === "")) {
      throw new Error(`Field "${field.name}" is required`);
    }

    if (value !== undefined && field.regex) {
      const regex = new RegExp(field.regex);
      if (!regex.test(String(value))) {
        throw new Error(`Field "${field.name}" does not match expected format`);
      }
    }
  }
}
