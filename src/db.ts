import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DB_PATH = path.join(__dirname, "../data/platform.db");

// Ensure the data directory exists (required on fresh deployments / Railway)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    rule TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Preference revision table — immutable snapshot rows
db.exec(`
  CREATE TABLE IF NOT EXISTS preference_revisions (
    id          TEXT PRIMARY KEY,
    pref_id     TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    category    TEXT NOT NULL,
    rule        TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Webhook endpoints table
db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT NOT NULL,
    events      TEXT NOT NULL DEFAULT '["preference.created","preference.updated","preference.deleted"]',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id          TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    status      INTEGER NOT NULL DEFAULT 0,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Metrics table — aggregate counters only, NO rule body stored
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics_hourly (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    hour        TEXT NOT NULL,            -- ISO hour bucket: 2026-05-08T14:00Z
    user_id     INTEGER,                  -- NULL = platform-wide aggregate
    endpoint    TEXT NOT NULL,            -- "mcp", "api", "auth", "static"
    calls       INTEGER NOT NULL DEFAULT 0,
    errors      INTEGER NOT NULL DEFAULT 0,
    latency_sum INTEGER NOT NULL DEFAULT 0,  -- ms total for avg calc
    latency_p99 INTEGER NOT NULL DEFAULT 0,  -- highest observed ms this hour
    UNIQUE (hour, user_id, endpoint)
  );
`);

// Audit table — tracks all preference state changes (ii-061)
db.exec(`
  CREATE TABLE IF NOT EXISTS pref_audit (
    id          TEXT PRIMARY KEY,
    pref_id     TEXT NOT NULL,
    actor_id    INTEGER NOT NULL,
    actor_email TEXT NOT NULL,
    action      TEXT NOT NULL,
    diff_hash   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations — safe to run on every boot, errors mean column already exists
const migrations = [
  `ALTER TABLE preferences ADD COLUMN sort_order INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`,
  `ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT`,
  `ALTER TABLE users ADD COLUMN plan_expires_at TEXT`,
  `ALTER TABLE preference_revisions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
  `ALTER TABLE preferences ADD COLUMN scope_env TEXT DEFAULT NULL`,
  `ALTER TABLE preferences ADD COLUMN scope_project TEXT DEFAULT NULL`,
  `ALTER TABLE preferences ADD COLUMN scope_client TEXT DEFAULT NULL`,
  `ALTER TABLE preferences ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

// User queries
export const userQueries = {
  create: db.prepare(`
    INSERT INTO users (email, password_hash, api_key, is_admin)
    VALUES (@email, @passwordHash, @apiKey, @isAdmin)
  `),
  findByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findByApiKey: db.prepare(`SELECT * FROM users WHERE api_key = ?`),
  findById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  findByStripeCustomerId: db.prepare(`SELECT * FROM users WHERE stripe_customer_id = ?`),
  findByStripeSubscriptionId: db.prepare(`SELECT * FROM users WHERE stripe_subscription_id = ?`),
  count: db.prepare(`SELECT COUNT(*) as count FROM users`),
  listAll: db.prepare(`SELECT id, email, is_admin, created_at, plan FROM users ORDER BY created_at DESC`),
  regenerateApiKey: db.prepare(`UPDATE users SET api_key = ? WHERE id = ?`),
  delete: db.prepare(`DELETE FROM users WHERE id = ?`),
  totalCount: db.prepare(`SELECT COUNT(*) as count FROM users`),
  updatePlan: db.prepare(`
    UPDATE users SET plan = @plan, stripe_customer_id = @stripeCustomerId,
    stripe_subscription_id = @stripeSubscriptionId, plan_expires_at = @planExpiresAt
    WHERE id = @id
  `),
  updatePlanByCustomerId: db.prepare(`
    UPDATE users SET plan = @plan, stripe_subscription_id = @stripeSubscriptionId,
    plan_expires_at = @planExpiresAt WHERE stripe_customer_id = @stripeCustomerId
  `),
};

// Preference queries
export const prefQueries = {
  create: db.prepare(`
    INSERT INTO preferences (id, user_id, category, rule, scope_env, scope_project, scope_client)
    VALUES (@id, @userId, @category, @rule, @scopeEnv, @scopeProject, @scopeClient)
  `),
  listByUser: db.prepare(`SELECT * FROM preferences WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`),
  delete: db.prepare(`DELETE FROM preferences WHERE id = ? AND user_id = ?`),
  deleteByUser: db.prepare(`DELETE FROM preferences WHERE user_id = ?`),
  countByUser: db.prepare(`SELECT COUNT(*) as count FROM preferences WHERE user_id = ?`),
  categoriesByUser: db.prepare(`SELECT COUNT(DISTINCT category) as count FROM preferences WHERE user_id = ?`),
  totalCount: db.prepare(`SELECT COUNT(*) as count FROM preferences`),
  updatePref: db.prepare(`UPDATE preferences SET category = @category, rule = @rule, scope_env = @scopeEnv, scope_project = @scopeProject, scope_client = @scopeClient WHERE id = @id AND user_id = @userId`),
  updateSortOrder: db.prepare(`UPDATE preferences SET sort_order = @sortOrder WHERE id = @id AND user_id = @userId`),
  renameCategory: db.prepare(`UPDATE preferences SET category = ? WHERE category = ? AND user_id = ?`),
  lastUpdatedByUser: db.prepare(`SELECT MAX(created_at) as last_updated FROM preferences WHERE user_id = ?`),
  categoryBreakdownByUser: db.prepare(`SELECT category, COUNT(*) as count FROM preferences WHERE user_id = ? GROUP BY category ORDER BY count DESC`),
  recentByUser: db.prepare(`SELECT id, category, rule, created_at FROM preferences WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`),
  findById: db.prepare(`SELECT * FROM preferences WHERE id = ? AND user_id = ?`),
  listByCategory: db.prepare(`SELECT * FROM preferences WHERE user_id = ? AND LOWER(category) = LOWER(?) ORDER BY sort_order ASC, created_at ASC`),
  deleteByCategory: db.prepare(`DELETE FROM preferences WHERE user_id = ? AND LOWER(category) = LOWER(?)`),
  searchByUser: db.prepare(`SELECT * FROM preferences WHERE user_id = ? AND (LOWER(rule) LIKE LOWER(?) OR LOWER(category) LIKE LOWER(?)) ORDER BY sort_order ASC, created_at ASC`),
  getScopedPrefs: db.prepare(`
    SELECT * FROM preferences
    WHERE user_id = ?
      AND (scope_env IS NULL OR scope_env = ?)
      AND (scope_project IS NULL OR scope_project = ?)
      AND (scope_client IS NULL OR scope_client = ?)
    ORDER BY sort_order ASC, created_at ASC
  `),
};

// Revision queries
export const revisionQueries = {
  create: db.prepare(`
    INSERT INTO preference_revisions (id, pref_id, user_id, category, rule, version)
    VALUES (@id, @prefId, @userId, @category, @rule, @version)
  `),
  listByPref: db.prepare(`
    SELECT * FROM preference_revisions WHERE pref_id = ? AND user_id = ?
    ORDER BY version DESC LIMIT 50
  `),
  latestVersion: db.prepare(`
    SELECT MAX(version) as v FROM preference_revisions WHERE pref_id = ? AND user_id = ?
  `),
  getRevision: db.prepare(`
    SELECT * FROM preference_revisions WHERE id = ? AND user_id = ?
  `),
};

// Webhook queries
export const webhookQueries = {
  create: db.prepare(`
    INSERT INTO webhook_endpoints (id, user_id, url, secret, events)
    VALUES (@id, @userId, @url, @secret, @events)
  `),
  listByUser: db.prepare(`SELECT * FROM webhook_endpoints WHERE user_id = ? ORDER BY created_at DESC`),
  findById: db.prepare(`SELECT * FROM webhook_endpoints WHERE id = ? AND user_id = ?`),
  update: db.prepare(`UPDATE webhook_endpoints SET url = @url, events = @events, enabled = @enabled WHERE id = @id AND user_id = @userId`),
  delete: db.prepare(`DELETE FROM webhook_endpoints WHERE id = ? AND user_id = ?`),
  listAllEnabled: db.prepare(`SELECT * FROM webhook_endpoints WHERE enabled = 1`),
  logDelivery: db.prepare(`
    INSERT INTO webhook_deliveries (id, endpoint_id, event_type, payload, status, attempts, last_attempt_at)
    VALUES (@id, @endpointId, @eventType, @payload, @status, @attempts, @lastAttemptAt)
  `),
  updateDelivery: db.prepare(`
    UPDATE webhook_deliveries SET status = @status, attempts = @attempts, last_attempt_at = @lastAttemptAt WHERE id = @id
  `),
};

// Metrics queries
export const metricsQueries = {
  upsert: db.prepare(`
    INSERT INTO metrics_hourly (hour, user_id, endpoint, calls, errors, latency_sum, latency_p99)
    VALUES (@hour, @userId, @endpoint, @calls, @errors, @latencySum, @latencyP99)
    ON CONFLICT(hour, user_id, endpoint) DO UPDATE SET
      calls       = calls       + excluded.calls,
      errors      = errors      + excluded.errors,
      latency_sum = latency_sum + excluded.latency_sum,
      latency_p99 = MAX(latency_p99, excluded.latency_p99)
  `),
  // Platform-wide: last 24 hours per endpoint
  recentPlatform: db.prepare(`
    SELECT endpoint,
           SUM(calls)       as calls,
           SUM(errors)      as errors,
           SUM(latency_sum) as latency_sum,
           MAX(latency_p99) as latency_p99
    FROM metrics_hourly
    WHERE hour >= datetime('now', '-24 hours', 'start of hour')
      AND user_id IS NULL
    GROUP BY endpoint
    ORDER BY calls DESC
  `),
  // Hourly series for the last 48h (for chart)
  hourlySeries: db.prepare(`
    SELECT hour, endpoint, SUM(calls) as calls, SUM(errors) as errors
    FROM metrics_hourly
    WHERE hour >= datetime('now', '-48 hours', 'start of hour')
      AND user_id IS NULL
    GROUP BY hour, endpoint
    ORDER BY hour ASC
  `),
  // Top users by MCP call volume
  topUsers: db.prepare(`
    SELECT u.email, SUM(m.calls) as calls, SUM(m.errors) as errors
    FROM metrics_hourly m
    JOIN users u ON u.id = m.user_id
    WHERE m.hour >= datetime('now', '-24 hours', 'start of hour')
      AND m.endpoint = 'mcp'
    GROUP BY m.user_id
    ORDER BY calls DESC
    LIMIT 10
  `),
  // Total platform lifetime
  totals: db.prepare(`
    SELECT
      SUM(calls)  as total_calls,
      SUM(errors) as total_errors,
      COUNT(DISTINCT user_id) as active_users
    FROM metrics_hourly
    WHERE user_id IS NULL
  `),
  // Delete old data beyond retention (default 90 days)
  purgeOld: db.prepare(`
    DELETE FROM metrics_hourly WHERE hour < datetime('now', '-90 days')
  `),
};

// Workflow status queries (ii-060)
export const workflowQueries = {
  updateStatus: db.prepare(`UPDATE preferences SET status = @status WHERE id = @id AND user_id = @userId`),
  updateStatusAdmin: db.prepare(`UPDATE preferences SET status = @status WHERE id = @id`),
  findByIdAnyUser: db.prepare(`SELECT p.*, u.email as user_email FROM preferences p JOIN users u ON u.id = p.user_id WHERE p.id = ?`),
  pendingReview: db.prepare(`
    SELECT p.id, p.user_id, p.category, p.rule, p.status, p.created_at,
           u.email as user_email
    FROM preferences p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'pending_review'
    ORDER BY p.created_at ASC
  `),
};

// Audit queries (ii-061)
export const auditQueries = {
  create: db.prepare(`
    INSERT INTO pref_audit (id, pref_id, actor_id, actor_email, action, diff_hash)
    VALUES (@id, @prefId, @actorId, @actorEmail, @action, @diffHash)
  `),
  listByUser: db.prepare(`
    SELECT * FROM pref_audit WHERE actor_id = ? ORDER BY created_at DESC LIMIT 100
  `),
  listAll: db.prepare(`
    SELECT * FROM pref_audit ORDER BY created_at DESC LIMIT 200
  `),
};

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}
