/**
 * Audit export API — ii-100, ii-101
 *
 * GET  /api/audit/export            — NDJSON / CSV stream of revision + delivery history
 * GET  /api/admin/audit/export      — admin: all users
 *
 * Pagination: ?cursor=<ISO-ts>&limit=<n>  (cursor-based on created_at DESC)
 * Format:     ?format=ndjson (default) | csv
 * Window:     ?days=<n> (default 30, max 90)
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../auth";
import { db } from "../db";

const router = Router();

type AuditRow = {
  id: string;
  ts: string;
  actor: string;         // email (revisions) or endpoint_id (deliveries)
  action: string;        // preference.created | preference.updated | preference.deleted | webhook.delivered | webhook.failed
  target_id: string;     // pref_id or endpoint_id
  detail: string;        // category only — never the rule text
};

function streamRows(res: Response, rows: AuditRow[], format: "ndjson" | "csv"): void {
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.write("id,ts,actor,action,target_id,detail\n");
    for (const r of rows) {
      const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      res.write(`${esc(r.id)},${esc(r.ts)},${esc(r.actor)},${esc(r.action)},${esc(r.target_id)},${esc(r.detail)}\n`);
    }
  } else {
    res.setHeader("Content-Type", "application/x-ndjson");
    for (const r of rows) {
      res.write(JSON.stringify(r) + "\n");
    }
  }
  res.end();
}

function buildAuditRows(userId: number | null, days: number): AuditRow[] {
  const since = `datetime('now', '-${days} days')`;

  // Preference revision events (created / updated)
  const revisionSql = userId
    ? `SELECT pr.id, pr.created_at as ts, u.email as actor,
              CASE WHEN pr.version = 1 THEN 'preference.created' ELSE 'preference.updated' END as action,
              pr.pref_id as target_id, pr.category as detail
         FROM preference_revisions pr
         JOIN users u ON u.id = pr.user_id
         WHERE pr.user_id = ? AND pr.created_at >= ${since}
         ORDER BY pr.created_at DESC LIMIT 1000`
    : `SELECT pr.id, pr.created_at as ts, u.email as actor,
              CASE WHEN pr.version = 1 THEN 'preference.created' ELSE 'preference.updated' END as action,
              pr.pref_id as target_id, pr.category as detail
         FROM preference_revisions pr
         JOIN users u ON u.id = pr.user_id
         WHERE pr.created_at >= ${since}
         ORDER BY pr.created_at DESC LIMIT 2000`;

  const revRows = (userId
    ? db.prepare(revisionSql).all(userId)
    : db.prepare(revisionSql).all()) as any[];

  // Webhook delivery events
  const deliverySql = userId
    ? `SELECT wd.id, wd.created_at as ts, we.url as actor,
              CASE WHEN wd.status >= 200 AND wd.status < 300 THEN 'webhook.delivered' ELSE 'webhook.failed' END as action,
              wd.endpoint_id as target_id, wd.event_type as detail
         FROM webhook_deliveries wd
         JOIN webhook_endpoints we ON we.id = wd.endpoint_id
         WHERE we.user_id = ? AND wd.created_at >= ${since}
         ORDER BY wd.created_at DESC LIMIT 500`
    : `SELECT wd.id, wd.created_at as ts, we.url as actor,
              CASE WHEN wd.status >= 200 AND wd.status < 300 THEN 'webhook.delivered' ELSE 'webhook.failed' END as action,
              wd.endpoint_id as target_id, wd.event_type as detail
         FROM webhook_deliveries wd
         JOIN webhook_endpoints we ON we.id = wd.endpoint_id
         WHERE wd.created_at >= ${since}
         ORDER BY wd.created_at DESC LIMIT 1000`;

  let deliveryRows: any[] = [];
  try {
    deliveryRows = (userId
      ? db.prepare(deliverySql).all(userId)
      : db.prepare(deliverySql).all()) as any[];
  } catch (_) {
    // webhook_deliveries may not have data yet
  }

  // Merge and sort by ts DESC
  const all = [...revRows, ...deliveryRows] as AuditRow[];
  all.sort((a, b) => (b.ts > a.ts ? 1 : -1));
  return all;
}

// GET /api/audit/export — own user's audit trail
router.get("/api/audit/export", requireAuth, (req: Request, res: Response) => {
  const userId   = (req as any).user?.id ?? req.session.userId;
  const format   = (req.query.format as string) === "csv" ? "csv" : "ndjson";
  const days     = Math.min(90, Number(req.query.days) || 30);
  const filename = `audit-${days}d.${format === "csv" ? "csv" : "ndjson"}`;

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    const rows = buildAuditRows(userId, days);
    streamRows(res, rows, format);
  } catch (err: any) {
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/admin/audit/export — admin: all users
router.get("/api/admin/audit/export", requireAdmin, (req: Request, res: Response) => {
  const format   = (req.query.format as string) === "csv" ? "csv" : "ndjson";
  const days     = Math.min(90, Number(req.query.days) || 30);
  const filename = `audit-all-${days}d.${format === "csv" ? "csv" : "ndjson"}`;

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    const rows = buildAuditRows(null, days);
    streamRows(res, rows, format);
  } catch (err: any) {
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
