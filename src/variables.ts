import { db } from "./db";
import { logger } from "./logger";

const log = logger.child("variables");

// Create variables table
db.exec(`
  CREATE TABLE IF NOT EXISTS variables (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    encrypted INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_variables_scope ON variables(scope);
`);

const upsertVar = db.prepare(`
  INSERT INTO variables (key, value, scope, encrypted, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
`);

const getVar = db.prepare(`SELECT * FROM variables WHERE key = ?`);
const deleteVar = db.prepare(`DELETE FROM variables WHERE key = ?`);
const listVarsByScope = db.prepare(`SELECT * FROM variables WHERE scope = ? ORDER BY key`);
const listAllVars = db.prepare(`SELECT * FROM variables ORDER BY scope, key`);

interface Variable {
  key: string;
  value: string;
  scope: string;
  encrypted: number;
  updated_at: string;
}

export function setVariable(key: string, value: string, scope = "global"): void {
  const now = new Date().toISOString();
  upsertVar.run(key, value, scope, 0, now, value, now);
  log.debug("Variable set", { key, scope });
}

export function getVariable(key: string): string | null {
  const row = getVar.get(key) as Variable | undefined;
  return row?.value ?? null;
}

export function deleteVariable(key: string): boolean {
  const result = deleteVar.run(key);
  return result.changes > 0;
}

export function listVariables(scope?: string): Variable[] {
  if (scope) {
    return listVarsByScope.all(scope) as Variable[];
  }
  return listAllVars.all() as Variable[];
}

// Template resolver — replaces {{var:key}} in strings
export function resolveTemplate(template: string): string {
  return template.replace(/\{\{var:([^}]+)\}\}/g, (_match, key: string) => {
    return getVariable(key.trim()) ?? "";
  });
}

// Resolve all {{var:key}} in an object's string values recursively
export function resolveTemplateObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return resolveTemplate(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveTemplateObject(item)) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveTemplateObject(value);
    }
    return result as T;
  }
  return obj;
}
