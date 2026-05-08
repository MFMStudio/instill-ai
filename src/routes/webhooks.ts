import { Router, Request, Response } from "express";
import crypto from "crypto";
import { requireAuth } from "../auth";
import { webhookQueries, generateId } from "../db";
import { fireWebhook } from "../webhooks";

const router = Router();

const ALLOWED_EVENTS = [
  "preference.created",
  "preference.updated",
  "preference.deleted",
];

// GET /api/webhooks — list user's endpoints
router.get("/api/webhooks", requireAuth, (req: Request, res: Response) => {
  const endpoints = webhookQueries.listByUser.all(req.session.userId!) as any[];
  // Never expose the raw secret — return a masked hint only
  res.json(endpoints.map((ep) => ({
    ...ep,
    secret: ep.secret.slice(0, 8) + "…",
    events: JSON.parse(ep.events || "[]"),
  })));
});

// POST /api/webhooks — create endpoint
router.post("/api/webhooks", requireAuth, (req: Request, res: Response) => {
  const { url, events } = req.body as { url?: string; events?: string[] };
  if (!url) { res.status(400).json({ error: "url is required" }); return; }

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    res.status(400).json({ error: "url must be a valid HTTPS URL" }); return;
  }
  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: "url must use http or https" }); return;
  }

  const filteredEvents = (events || ALLOWED_EVENTS).filter((e) => ALLOWED_EVENTS.includes(e));
  if (!filteredEvents.length) {
    res.status(400).json({ error: "At least one valid event type required" }); return;
  }

  const id = generateId();
  const secret = "whsec_" + crypto.randomBytes(24).toString("hex");
  webhookQueries.create.run({
    id,
    userId: req.session.userId!,
    url,
    secret,
    events: JSON.stringify(filteredEvents),
  });

  res.status(201).json({ id, url, events: filteredEvents, secret }); // return full secret only on creation
});

// PUT /api/webhooks/:id — update endpoint
router.put("/api/webhooks/:id", requireAuth, (req: Request, res: Response) => {
  const { url, events, enabled } = req.body;
  const existing = webhookQueries.findById.get(req.params.id, req.session.userId!) as any;
  if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

  const filteredEvents = events
    ? (events as string[]).filter((e) => ALLOWED_EVENTS.includes(e))
    : JSON.parse(existing.events);

  webhookQueries.update.run({
    id: req.params.id,
    userId: req.session.userId!,
    url: url || existing.url,
    events: JSON.stringify(filteredEvents),
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
  });
  res.json({ success: true });
});

// DELETE /api/webhooks/:id
router.delete("/api/webhooks/:id", requireAuth, (req: Request, res: Response) => {
  const existing = webhookQueries.findById.get(req.params.id, req.session.userId!) as any;
  if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }
  webhookQueries.delete.run(req.params.id, req.session.userId!);
  res.json({ success: true });
});

// POST /api/webhooks/:id/test — send a test ping
router.post("/api/webhooks/:id/test", requireAuth, (req: Request, res: Response) => {
  const existing = webhookQueries.findById.get(req.params.id, req.session.userId!) as any;
  if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

  fireWebhook(req.session.userId!, "preference.created", {
    test: true,
    preference: { id: "test-id", category: "behaviour", rule: "This is a test webhook delivery." },
  });

  res.json({ success: true, message: "Test event dispatched" });
});

export default router;
