import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { requireAuth, requireAdmin } from "../auth";
import { userQueries, prefQueries, revisionQueries, generateApiKey, generateId } from "../db";
import { fireWebhook } from "../webhooks";
import { normalizePhone, syncStripeCustomerBilling } from "../stripeSync";

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripeClient = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" as any })
  : null;

// ── Helpers ────────────────────────────────────────────────────────────────
function snapshotPref(pref: { id: string; user_id: number; category: string; rule: string }, userId: number): void {
  try {
    const row = revisionQueries.latestVersion.get(pref.id, userId) as any;
    const version = (row?.v ?? 0) + 1;
    revisionQueries.create.run({
      id:       generateId(),
      prefId:   pref.id,
      userId,
      category: pref.category,
      rule:     pref.rule,
      version,
    });
  } catch (_) { /* snapshot failure must never block the write */ }
}

// ── Preferences ────────────────────────────────────────────────────────────

// !! Reorder MUST be registered before /:id or Express matches "reorder" as an id param
router.put("/api/preferences/reorder", requireAuth, (req: Request, res: Response) => {
  const { order } = req.body as { order: { id: string; sortOrder: number }[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order array required" }); return; }
  for (const item of order) {
    prefQueries.updateSortOrder.run({ sortOrder: item.sortOrder, id: item.id, userId: req.session.userId! });
  }
  res.json({ success: true });
});

router.get("/api/preferences", requireAuth, (req: Request, res: Response) => {
  const prefs = prefQueries.listByUser.all(req.session.userId!);
  res.json(prefs);
});

router.post("/api/preferences", requireAuth, (req: Request, res: Response) => {
  const { category, rule, scope_env, scope_project, scope_client } = req.body;
  if (!category || !rule) { res.status(400).json({ error: "Category and rule required" }); return; }

  const id = generateId();
  const userId = req.session.userId!;
  const scopeEnv = scope_env || null;
  const scopeProject = scope_project || null;
  const scopeClient = scope_client || null;
  prefQueries.create.run({ id, userId, category, rule, scopeEnv, scopeProject, scopeClient });

  const pref = { id, user_id: userId, category, rule };
  snapshotPref(pref, userId);
  fireWebhook(userId, "preference.created", { preference: { id, category, rule, scope_env: scopeEnv, scope_project: scopeProject, scope_client: scopeClient } });

  res.json({ id, category, rule, scope_env: scopeEnv, scope_project: scopeProject, scope_client: scopeClient });
});

router.put("/api/preferences/:id", requireAuth, (req: Request, res: Response) => {
  const { category, rule, scope_env, scope_project, scope_client } = req.body;
  if (!category || !rule) { res.status(400).json({ error: "Category and rule required" }); return; }

  const userId = req.session.userId!;
  const scopeEnv = scope_env !== undefined ? (scope_env || null) : undefined;
  const scopeProject = scope_project !== undefined ? (scope_project || null) : undefined;
  const scopeClient = scope_client !== undefined ? (scope_client || null) : undefined;

  // Fetch existing to preserve scope fields if not supplied
  const existing = prefQueries.findById.get(req.params.id, userId) as any;
  if (!existing) { res.status(404).json({ error: "Preference not found" }); return; }

  const finalScopeEnv     = scopeEnv     !== undefined ? scopeEnv     : (existing.scope_env     ?? null);
  const finalScopeProject = scopeProject !== undefined ? scopeProject : (existing.scope_project ?? null);
  const finalScopeClient  = scopeClient  !== undefined ? scopeClient  : (existing.scope_client  ?? null);

  const result = prefQueries.updatePref.run({ category, rule, scopeEnv: finalScopeEnv, scopeProject: finalScopeProject, scopeClient: finalScopeClient, id: req.params.id, userId }) as any;
  if (result.changes === 0) { res.status(404).json({ error: "Preference not found" }); return; }

  snapshotPref({ id: req.params.id, user_id: userId, category, rule }, userId);
  fireWebhook(userId, "preference.updated", { preference: { id: req.params.id, category, rule, scope_env: finalScopeEnv, scope_project: finalScopeProject, scope_client: finalScopeClient } });

  res.json({ success: true });
});

router.delete("/api/preferences/:id", requireAuth, (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const existing = prefQueries.findById.get(req.params.id, userId) as any;
  const result = prefQueries.delete.run(req.params.id, userId) as any;
  if (result.changes === 0) { res.status(404).json({ error: "Preference not found" }); return; }

  if (existing) {
    fireWebhook(userId, "preference.deleted", { preference: { id: req.params.id, category: existing.category } });
  }
  res.json({ success: true });
});

// ── Preference history (ii-022/ii-023) ────────────────────────────────────
router.get("/api/preferences/:id/history", requireAuth, (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const revisions = revisionQueries.listByPref.all(req.params.id, userId);
  res.json(revisions);
});

router.post("/api/preferences/:id/restore/:revisionId", requireAuth, (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const revision = revisionQueries.getRevision.get(req.params.revisionId, userId) as any;
  if (!revision || revision.pref_id !== req.params.id) {
    res.status(404).json({ error: "Revision not found" }); return;
  }

  const result = prefQueries.updatePref.run({
    category: revision.category,
    rule:     revision.rule,
    id:       req.params.id,
    userId,
  }) as any;

  if (result.changes === 0) { res.status(404).json({ error: "Preference not found" }); return; }

  snapshotPref({ id: req.params.id, user_id: userId, category: revision.category, rule: revision.rule }, userId);
  fireWebhook(userId, "preference.updated", {
    preference: { id: req.params.id, category: revision.category, rule: revision.rule },
    restored_from_version: revision.version,
  });

  res.json({ success: true, restored: { category: revision.category, rule: revision.rule } });
});

// ── Categories ─────────────────────────────────────────────────────────────
router.put("/api/categories/rename", requireAuth, (req: Request, res: Response) => {
  const { oldCategory, newCategory } = req.body;
  if (!oldCategory || !newCategory) { res.status(400).json({ error: "oldCategory and newCategory required" }); return; }
  prefQueries.renameCategory.run(newCategory, oldCategory, req.session.userId!);
  res.json({ success: true });
});

// ── API Key ────────────────────────────────────────────────────────────────
router.get("/api/key", requireAuth, (req: Request, res: Response) => {
  const user = userQueries.findById.get(req.session.userId!) as any;
  res.json({ apiKey: user.api_key });
});

router.post("/api/key/regenerate", requireAuth, (req: Request, res: Response) => {
  const newKey = generateApiKey();
  userQueries.regenerateApiKey.run(newKey, req.session.userId!);
  res.json({ apiKey: newKey });
});

// ── Profile ────────────────────────────────────────────────────────────────
router.get("/api/me", requireAuth, (req: Request, res: Response) => {
  const user = userQueries.findById.get(req.session.userId!) as any;
  res.json({
    id:        user.id,
    email:     user.email,
    isAdmin:   user.is_admin === 1,
    plan:      user.plan || "free",
    createdAt: user.created_at,
    fullName:  user.full_name ?? null,
    phone:     user.phone ?? null,
    company:   user.company ?? null,
    hasStripeCustomer: !!user.stripe_customer_id,
  });
});

router.patch("/api/me/profile", requireAuth, async (req: Request, res: Response) => {
  const { full_name, phone, company } = req.body as Record<string, unknown>;
  const fullName = typeof full_name === "string" ? full_name.trim().slice(0, 200) || null : null;
  const phoneNorm = normalizePhone(phone);
  const companyTrim = typeof company === "string" ? company.trim().slice(0, 200) || null : null;

  const id = req.session.userId!;
  userQueries.updateProfile.run({ id, fullName, phone: phoneNorm, company: companyTrim });

  const user = userQueries.findById.get(id) as any;
  let stripeWarning: string | undefined;
  if (stripeClient && user?.stripe_customer_id) {
    try {
      await syncStripeCustomerBilling({
        stripe: stripeClient,
        stripeCustomerId: user.stripe_customer_id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        company: user.company,
        userId: id,
      });
    } catch (e: any) {
      console.error("[Profile] Stripe sync:", e.message);
      stripeWarning = "Saved here; Stripe billing profile could not be updated. Try again before checkout.";
    }
  }

  res.json({
    success: true,
    fullName: user.full_name ?? null,
    phone: user.phone ?? null,
    company: user.company ?? null,
    ...(stripeWarning ? { warning: stripeWarning } : {}),
  });
});

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/api/stats", requireAuth, (req: Request, res: Response) => {
  const user             = userQueries.findById.get(req.session.userId!) as any;
  const prefCount        = (prefQueries.countByUser.get(req.session.userId!) as any).count;
  const catCount         = (prefQueries.categoriesByUser.get(req.session.userId!) as any).count;
  const lastUpdatedRow   = prefQueries.lastUpdatedByUser.get(req.session.userId!) as any;
  const categoryBreakdown = prefQueries.categoryBreakdownByUser.all(req.session.userId!);
  const recent           = prefQueries.recentByUser.all(req.session.userId!);
  res.json({ prefCount, catCount, memberSince: user.created_at, lastUpdated: lastUpdatedRow?.last_updated ?? null, categoryBreakdown, recent });
});

router.get("/api/admin/stats", requireAdmin, (_req: Request, res: Response) => {
  const totalUsers = (userQueries.totalCount.get() as any).count;
  const totalPrefs = (prefQueries.totalCount.get() as any).count;
  res.json({ totalUsers, totalPrefs });
});

// ── Admin ──────────────────────────────────────────────────────────────────
router.get("/api/admin/users", requireAdmin, (_req: Request, res: Response) => {
  res.json(userQueries.listAll.all());
});

router.delete("/api/admin/users/:id", requireAdmin, (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.session.userId) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  prefQueries.deleteByUser.run(targetId);
  userQueries.delete.run(targetId);
  res.json({ success: true });
});

export default router;
