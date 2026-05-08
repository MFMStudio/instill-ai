import { Router, Request, Response } from "express";
import crypto from "crypto";
import { requireAuth, requireAdmin } from "../auth";
import { workflowQueries, auditQueries, prefQueries, userQueries, generateId } from "../db";

const router = Router();

function diffHash(category: string, rule: string): string {
  return crypto.createHash("sha256").update(category + "::" + rule).digest("hex");
}

function writeAudit(prefId: string, actorId: number, actorEmail: string, action: string, hash?: string) {
  auditQueries.create.run({
    id: generateId(),
    prefId,
    actorId,
    actorEmail,
    action,
    diffHash: hash ?? null,
  });
}

// ── Submit for review ──────────────────────────────────────────────────────
router.post("/api/preferences/:id/submit-review", requireAuth, (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const pref = prefQueries.findById.get(req.params.id, userId) as any;
  if (!pref) { res.status(404).json({ error: "Preference not found" }); return; }

  workflowQueries.updateStatus.run({ status: "pending_review", id: req.params.id, userId });

  const user = userQueries.findById.get(userId) as any;
  writeAudit(req.params.id, userId, user.email, "submitted_for_review", diffHash(pref.category, pref.rule));

  res.json({ success: true, status: "pending_review" });
});

// ── Approve (admin) ────────────────────────────────────────────────────────
router.post("/api/preferences/:id/approve", requireAdmin, (req: Request, res: Response) => {
  const pref = workflowQueries.findByIdAnyUser.get(req.params.id) as any;
  if (!pref) { res.status(404).json({ error: "Preference not found" }); return; }

  workflowQueries.updateStatusAdmin.run({ status: "active", id: req.params.id });

  const actorId = req.session.userId!;
  const admin = userQueries.findById.get(actorId) as any;
  writeAudit(req.params.id, actorId, admin.email, "approved", diffHash(pref.category, pref.rule));

  res.json({ success: true, status: "active" });
});

// ── Reject (admin) ─────────────────────────────────────────────────────────
router.post("/api/preferences/:id/reject", requireAdmin, (req: Request, res: Response) => {
  const pref = workflowQueries.findByIdAnyUser.get(req.params.id) as any;
  if (!pref) { res.status(404).json({ error: "Preference not found" }); return; }

  workflowQueries.updateStatusAdmin.run({ status: "draft", id: req.params.id });

  const actorId = req.session.userId!;
  const admin = userQueries.findById.get(actorId) as any;
  writeAudit(req.params.id, actorId, admin.email, "rejected", diffHash(pref.category, pref.rule));

  res.json({ success: true, status: "draft" });
});

// ── Review queue (admin) ───────────────────────────────────────────────────
router.get("/api/admin/review-queue", requireAdmin, (_req: Request, res: Response) => {
  const items = workflowQueries.pendingReview.all();
  res.json(items);
});

// ── Audit trail — current user ─────────────────────────────────────────────
router.get("/api/audit/trail", requireAuth, (req: Request, res: Response) => {
  const rows = auditQueries.listByUser.all(req.session.userId!);
  res.json(rows);
});

// ── Audit trail — all (admin) ──────────────────────────────────────────────
router.get("/api/admin/audit/trail", requireAdmin, (_req: Request, res: Response) => {
  const rows = auditQueries.listAll.all();
  res.json(rows);
});

export default router;
