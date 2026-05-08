/**
 * Admin metrics API
 * GET  /api/admin/metrics        — summary + hourly series + top users
 * GET  /api/admin/metrics/export — NDJSON or CSV export of metrics_hourly
 */

import { Router, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { metricsQueries, db } from "../db";

const router = Router();

// GET /api/admin/metrics — dashboard summary
router.get("/api/admin/metrics", requireAdmin, (_req: Request, res: Response) => {
  try {
    const totals      = metricsQueries.totals.get() as any ?? {};
    const recent      = metricsQueries.recentPlatform.all() as any[];
    const series      = metricsQueries.hourlySeries.all() as any[];
    const topUsers    = metricsQueries.topUsers.all() as any[];

    // Enrich recent with avg latency
    const endpoints = recent.map((r: any) => ({
      endpoint:     r.endpoint,
      calls:        r.calls,
      errors:       r.errors,
      errorRate:    r.calls > 0 ? Math.round((r.errors / r.calls) * 10000) / 100 : 0,
      avgLatencyMs: r.calls > 0 ? Math.round(r.latency_sum / r.calls) : 0,
      p99LatencyMs: r.latency_p99,
    }));

    res.json({
      totals: {
        totalCalls:  totals.total_calls  ?? 0,
        totalErrors: totals.total_errors ?? 0,
        activeUsers: totals.active_users ?? 0,
      },
      last24h: endpoints,
      series,
      topUsers,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Could not load metrics" });
  }
});

// GET /api/admin/metrics/export?format=csv — export metrics as CSV or NDJSON
router.get("/api/admin/metrics/export", requireAdmin, (req: Request, res: Response) => {
  const format = (req.query.format as string) === "ndjson" ? "ndjson" : "csv";
  const days   = Math.min(90, Number(req.query.days) || 7);

  try {
    const exportRows = db.prepare(`
      SELECT hour, endpoint,
             SUM(calls)       as calls,
             SUM(errors)      as errors,
             SUM(latency_sum) as latency_sum,
             MAX(latency_p99) as latency_p99
      FROM metrics_hourly
      WHERE hour >= datetime('now', '-${days} days')
        AND user_id IS NULL
      GROUP BY hour, endpoint
      ORDER BY hour ASC
    `).all() as any[];

    if (format === "ndjson") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="metrics-${days}d.ndjson"`);
      for (const row of exportRows) {
        res.write(JSON.stringify({
          hour:        row.hour,
          endpoint:    row.endpoint,
          calls:       row.calls,
          errors:      row.errors,
          avgLatencyMs: row.calls > 0 ? Math.round(row.latency_sum / row.calls) : 0,
          p99LatencyMs: row.latency_p99,
        }) + "\n");
      }
      res.end();
    } else {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="metrics-${days}d.csv"`);
      res.write("hour,endpoint,calls,errors,avg_latency_ms,p99_latency_ms\n");
      for (const row of exportRows) {
        const avg = row.calls > 0 ? Math.round(row.latency_sum / row.calls) : 0;
        res.write(`${row.hour},${row.endpoint},${row.calls},${row.errors},${avg},${row.latency_p99}\n`);
      }
      res.end();
    }
  } catch (err: any) {
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
