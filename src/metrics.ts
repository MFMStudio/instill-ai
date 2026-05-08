/**
 * Instill AI — Privacy-preserving telemetry middleware
 *
 * Records AGGREGATE counters only:
 *   - call counts per endpoint bucket ("mcp", "api", "auth", "static")
 *   - error counts (4xx/5xx)
 *   - latency (sum + max observed)
 *
 * NO preference rule text, NO request bodies, NO user identifiers
 * in the platform-wide (user_id = NULL) rows.
 *
 * Per-user rows record user_id + endpoint counts for the "top users"
 * admin view, but still never store rule text.
 */

import { Request, Response, NextFunction } from "express";
import { metricsQueries } from "./db";

/** Map a request path to a coarse endpoint bucket */
function bucket(path: string, method: string): string {
  if (path === "/mcp")                           return "mcp";
  if (path.startsWith("/api/"))                  return "api";
  if (path.startsWith("/auth/"))                 return "auth";
  if (path.startsWith("/webhooks/"))             return "webhooks";
  if (path.startsWith("/checkout/") || path.startsWith("/api/checkout/")) return "checkout";
  if (method === "GET" && !path.startsWith("/api")) return "static";
  return "other";
}

/** ISO hour string for bucketing: "2026-05-08T14:00Z" */
function hourBucket(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13) + ":00Z";
}

/** Record a single request to metrics_hourly — fire-and-forget, never throws */
function recordMetric(userId: number | null, endpointBucket: string, latencyMs: number, isError: boolean): void {
  try {
    const hour = hourBucket();
    const row = {
      hour,
      userId,
      endpoint: endpointBucket,
      calls: 1,
      errors: isError ? 1 : 0,
      latencySum: latencyMs,
      latencyP99: latencyMs,
    };
    // Platform-wide aggregate (user_id NULL)
    metricsQueries.upsert.run({ ...row, userId: null });
    // Per-user row (if authenticated)
    if (userId !== null) {
      metricsQueries.upsert.run({ ...row, userId });
    }
  } catch (_) {
    // Never throw from metrics collection
  }
}

/** Express middleware — attaches to every response via the 'finish' event */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();
  res.on("finish", () => {
    try {
      const latency = Date.now() - startMs;
      const ep      = bucket(req.path, req.method);
      const isError = res.statusCode >= 400;
      // Resolve user ID if authenticated (set by requireAuth/requireApiKey)
      const userId: number | null = (req as any).user?.id ?? (req as any).mcpUser?.id ?? null;
      recordMetric(userId, ep, latency, isError);
    } catch (_) {}
  });
  next();
}

/** Purge metrics older than retention window — call once per day */
export function purgeOldMetrics(): void {
  try {
    metricsQueries.purgeOld.run();
  } catch (_) {}
}
