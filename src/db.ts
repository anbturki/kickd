import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";

const DATA_DIR = join(import.meta.dir, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, "kickd.db");

const db = new Database(DB_PATH);

db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA foreign_keys=ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    output TEXT,
    duration_ms REAL,
    params TEXT,
    retry_attempt INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS skill_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    input TEXT,
    output TEXT,
    error TEXT,
    duration_ms REAL,
    chain_id TEXT
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    secret TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_rules (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    source_id TEXT,
    action_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action_input TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_channels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plugins (
    name TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    skills TEXT NOT NULL,
    installed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_runs_started_at ON task_runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_id ON skill_runs(skill_id);
  CREATE INDEX IF NOT EXISTS idx_skill_runs_chain_id ON skill_runs(chain_id);
  CREATE INDEX IF NOT EXISTS idx_events_log_event_type ON events_log(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_log_created_at ON events_log(created_at);
`);

// ── Task Run Logging ──

const insertTaskRun = db.prepare(`
  INSERT INTO task_runs (task_id, started_at, status, params, retry_attempt)
  VALUES (?, ?, ?, ?, ?)
`);

const updateTaskRun = db.prepare(`
  UPDATE task_runs SET finished_at = ?, status = ?, output = ?, duration_ms = ?
  WHERE id = ?
`);

const queryTaskHistory = db.prepare(`
  SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?
`);

const queryTaskStats = db.prepare(`
  SELECT
    task_id,
    COUNT(*) as total_runs,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
    AVG(duration_ms) as avg_duration_ms,
    MAX(started_at) as last_run
  FROM task_runs WHERE task_id = ?
  GROUP BY task_id
`);

export function startTaskRun(
  taskId: string,
  params?: Record<string, unknown>,
  retryAttempt = 0
): number {
  const result = insertTaskRun.run(
    taskId,
    new Date().toISOString(),
    "running",
    params ? JSON.stringify(params) : null,
    retryAttempt
  );
  return Number(result.lastInsertRowid);
}

export function finishTaskRun(
  runId: number,
  status: "completed" | "failed",
  output: string,
  durationMs: number
) {
  updateTaskRun.run(new Date().toISOString(), status, output, durationMs, runId);
}

export function getTaskHistory(taskId: string, limit = 20): TaskRunRow[] {
  return queryTaskHistory.all(taskId, limit) as TaskRunRow[];
}

export function getTaskStats(taskId: string): TaskStatsRow | null {
  return (queryTaskStats.get(taskId) as TaskStatsRow) ?? null;
}

// ── Skill Run Logging ──

const insertSkillRun = db.prepare(`
  INSERT INTO skill_runs (skill_id, started_at, status, input, chain_id)
  VALUES (?, ?, ?, ?, ?)
`);

const updateSkillRun = db.prepare(`
  UPDATE skill_runs SET finished_at = ?, status = ?, output = ?, error = ?, duration_ms = ?
  WHERE id = ?
`);

const querySkillHistory = db.prepare(`
  SELECT * FROM skill_runs WHERE skill_id = ? ORDER BY started_at DESC LIMIT ?
`);

export function startSkillRun(skillId: string, input: unknown, chainId?: string): number {
  const result = insertSkillRun.run(
    skillId,
    new Date().toISOString(),
    "running",
    JSON.stringify(input),
    chainId ?? null
  );
  return Number(result.lastInsertRowid);
}

export function finishSkillRun(
  runId: number,
  status: "completed" | "failed",
  output: unknown,
  error: string | null,
  durationMs: number
) {
  updateSkillRun.run(
    new Date().toISOString(),
    status,
    output ? JSON.stringify(output) : null,
    error,
    durationMs,
    runId
  );
}

export function getSkillHistory(skillId: string, limit = 20): SkillRunRow[] {
  return querySkillHistory.all(skillId, limit) as SkillRunRow[];
}

// ── Events Log ──

const insertEvent = db.prepare(`
  INSERT INTO events_log (event_type, source_type, source_id, payload, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const queryEvents = db.prepare(`
  SELECT * FROM events_log ORDER BY created_at DESC LIMIT ? OFFSET ?
`);

const queryEventsByType = db.prepare(`
  SELECT * FROM events_log WHERE event_type = ? ORDER BY created_at DESC LIMIT ?
`);

export function logEvent(eventType: string, sourceType: string, sourceId: string, payload?: unknown) {
  insertEvent.run(eventType, sourceType, sourceId, payload ? JSON.stringify(payload) : null, new Date().toISOString());
}

export function getEvents(limit = 50, offset = 0): EventLogRow[] {
  return queryEvents.all(limit, offset) as EventLogRow[];
}

export function getEventsByType(eventType: string, limit = 50): EventLogRow[] {
  return queryEventsByType.all(eventType, limit) as EventLogRow[];
}

// ── Webhooks ──

const insertWebhook = db.prepare(`
  INSERT INTO webhooks (id, name, target_type, target_id, secret, enabled, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const queryWebhooks = db.prepare(`SELECT * FROM webhooks ORDER BY created_at DESC`);
const queryWebhookById = db.prepare(`SELECT * FROM webhooks WHERE id = ?`);
const deleteWebhookById = db.prepare(`DELETE FROM webhooks WHERE id = ?`);
const toggleWebhookById = db.prepare(`UPDATE webhooks SET enabled = ? WHERE id = ?`);

export function createWebhook(webhook: {
  id: string;
  name: string;
  targetType: string;
  targetId: string;
  secret?: string;
}) {
  insertWebhook.run(
    webhook.id,
    webhook.name,
    webhook.targetType,
    webhook.targetId,
    webhook.secret ?? null,
    1,
    new Date().toISOString()
  );
}

export function getWebhooks(): WebhookRow[] {
  return queryWebhooks.all() as WebhookRow[];
}

export function getWebhook(id: string): WebhookRow | null {
  return (queryWebhookById.get(id) as WebhookRow) ?? null;
}

export function deleteWebhook(id: string) {
  deleteWebhookById.run(id);
}

export function toggleWebhook(id: string, enabled: boolean) {
  toggleWebhookById.run(enabled ? 1 : 0, id);
}

// ── Event Rules ──

const insertEventRule = db.prepare(`
  INSERT INTO event_rules (id, event_type, source_id, action_type, target_id, action_input, enabled, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const queryEventRules = db.prepare(`SELECT * FROM event_rules WHERE enabled = 1`);
const queryAllEventRules = db.prepare(`SELECT * FROM event_rules ORDER BY created_at DESC`);
const deleteEventRuleById = db.prepare(`DELETE FROM event_rules WHERE id = ?`);
const toggleEventRuleById = db.prepare(`UPDATE event_rules SET enabled = ? WHERE id = ?`);

export function createEventRule(rule: {
  id: string;
  eventType: string;
  sourceId?: string;
  actionType: string;
  targetId: string;
  actionInput?: Record<string, unknown>;
}) {
  insertEventRule.run(
    rule.id,
    rule.eventType,
    rule.sourceId ?? null,
    rule.actionType,
    rule.targetId,
    rule.actionInput ? JSON.stringify(rule.actionInput) : null,
    1,
    new Date().toISOString()
  );
}

export function getActiveEventRules(): EventRuleRow[] {
  return queryEventRules.all() as EventRuleRow[];
}

export function getAllEventRules(): EventRuleRow[] {
  return queryAllEventRules.all() as EventRuleRow[];
}

export function deleteEventRule(id: string) {
  deleteEventRuleById.run(id);
}

export function toggleEventRule(id: string, enabled: boolean) {
  toggleEventRuleById.run(enabled ? 1 : 0, id);
}

// ── Notification Channels ──

const insertChannel = db.prepare(`
  INSERT INTO notification_channels (id, type, url, events, enabled, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const queryChannels = db.prepare(`SELECT * FROM notification_channels WHERE enabled = 1`);
const queryAllChannels = db.prepare(`SELECT * FROM notification_channels ORDER BY created_at DESC`);
const deleteChannelById = db.prepare(`DELETE FROM notification_channels WHERE id = ?`);

export function createNotificationChannel(channel: {
  id: string;
  type: string;
  url: string;
  events: string[];
}) {
  insertChannel.run(
    channel.id,
    channel.type,
    channel.url,
    JSON.stringify(channel.events),
    1,
    new Date().toISOString()
  );
}

export function getActiveChannels(): NotificationChannelRow[] {
  return queryChannels.all() as NotificationChannelRow[];
}

export function getAllChannels(): NotificationChannelRow[] {
  return queryAllChannels.all() as NotificationChannelRow[];
}

export function deleteChannel(id: string) {
  deleteChannelById.run(id);
}

// ── Plugins ──

const insertPlugin = db.prepare(`
  INSERT OR REPLACE INTO plugins (name, version, skills, installed_at)
  VALUES (?, ?, ?, ?)
`);

const queryPlugins = db.prepare(`SELECT * FROM plugins ORDER BY installed_at DESC`);
const deletePluginByName = db.prepare(`DELETE FROM plugins WHERE name = ?`);

export function savePlugin(name: string, version: string, skillIds: string[]) {
  insertPlugin.run(name, version, JSON.stringify(skillIds), new Date().toISOString());
}

export function getPlugins(): PluginRow[] {
  return queryPlugins.all() as PluginRow[];
}

export function removePlugin(name: string) {
  deletePluginByName.run(name);
}

// ── Aggregate Stats ──

const queryGlobalStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM task_runs) as total_task_runs,
    (SELECT COUNT(*) FROM task_runs WHERE status = 'completed') as task_successes,
    (SELECT COUNT(*) FROM task_runs WHERE status = 'failed') as task_failures,
    (SELECT COUNT(*) FROM skill_runs) as total_skill_runs,
    (SELECT COUNT(*) FROM skill_runs WHERE status = 'completed') as skill_successes,
    (SELECT COUNT(*) FROM skill_runs WHERE status = 'failed') as skill_failures,
    (SELECT COUNT(*) FROM events_log) as total_events,
    (SELECT COUNT(*) FROM webhooks WHERE enabled = 1) as active_webhooks
`);

export function getGlobalStats(): GlobalStatsRow {
  return queryGlobalStats.get() as GlobalStatsRow;
}

// ── Row Types ──

export interface TaskRunRow {
  id: number;
  task_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
  duration_ms: number | null;
  params: string | null;
  retry_attempt: number;
}

export interface SkillRunRow {
  id: number;
  skill_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  input: string | null;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
  chain_id: string | null;
}

export interface EventLogRow {
  id: number;
  event_type: string;
  source_type: string;
  source_id: string;
  payload: string | null;
  created_at: string;
}

export interface WebhookRow {
  id: string;
  name: string;
  target_type: string;
  target_id: string;
  secret: string | null;
  enabled: number;
  created_at: string;
}

export interface EventRuleRow {
  id: string;
  event_type: string;
  source_id: string | null;
  action_type: string;
  target_id: string;
  action_input: string | null;
  enabled: number;
  created_at: string;
}

export interface NotificationChannelRow {
  id: string;
  type: string;
  url: string;
  events: string;
  enabled: number;
  created_at: string;
}

export interface PluginRow {
  name: string;
  version: string;
  skills: string;
  installed_at: string;
}

export interface TaskStatsRow {
  task_id: string;
  total_runs: number;
  successes: number;
  failures: number;
  avg_duration_ms: number | null;
  last_run: string | null;
}

export interface GlobalStatsRow {
  total_task_runs: number;
  task_successes: number;
  task_failures: number;
  total_skill_runs: number;
  skill_successes: number;
  skill_failures: number;
  total_events: number;
  active_webhooks: number;
}

export { db };
