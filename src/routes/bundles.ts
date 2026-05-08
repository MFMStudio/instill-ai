/**
 * Bundle import API — ii-071
 * GET  /api/bundles          — list curated starter bundles
 * POST /api/bundles/import   — import a bundle into the user's preferences
 */
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../auth";
import { prefQueries, revisionQueries, generateId } from "../db";
import { fireWebhook } from "../webhooks";

const router = Router();
const BUNDLES_DIR = path.join(__dirname, "../../bundles");

interface BundlePreference {
  category: string;
  rule: string;
}

interface Bundle {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  author: string;
  preferences: BundlePreference[];
}

function loadBundles(): Bundle[] {
  try {
    const files = fs.readdirSync(BUNDLES_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      const raw = fs.readFileSync(path.join(BUNDLES_DIR, f), "utf-8");
      return JSON.parse(raw) as Bundle;
    });
  } catch {
    return [];
  }
}

// GET /api/bundles — list available bundles (without the preference bodies for size)
router.get("/api/bundles", requireAuth, (_req: Request, res: Response) => {
  const bundles = loadBundles().map((b) => ({
    id:          b.id,
    name:        b.name,
    description: b.description,
    version:     b.version,
    tags:        b.tags,
    author:      b.author,
    count:       b.preferences.length,
  }));
  res.json(bundles);
});

// GET /api/bundles/:id — preview a single bundle
router.get("/api/bundles/:id", requireAuth, (req: Request, res: Response) => {
  const bundle = loadBundles().find((b) => b.id === req.params.id);
  if (!bundle) { res.status(404).json({ error: "Bundle not found" }); return; }
  res.json(bundle);
});

// POST /api/bundles/import — import bundle preferences into the user's account
router.post("/api/bundles/import", requireAuth, (req: Request, res: Response) => {
  const { bundleId, skipDuplicates = true } = req.body as { bundleId?: string; skipDuplicates?: boolean };
  if (!bundleId) { res.status(400).json({ error: "bundleId is required" }); return; }

  const bundle = loadBundles().find((b) => b.id === bundleId);
  if (!bundle) { res.status(404).json({ error: "Bundle not found" }); return; }

  const userId = req.session.userId!;
  const existing = prefQueries.listByUser.all(userId) as any[];
  const existingRules = new Set(existing.map((p) => p.rule.trim().toLowerCase()));

  let imported = 0;
  let skipped  = 0;

  for (const pref of bundle.preferences) {
    if (skipDuplicates && existingRules.has(pref.rule.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    const id = generateId();
    prefQueries.create.run({ id, userId, category: pref.category, rule: pref.rule });
    const row = { id, user_id: userId, category: pref.category, rule: pref.rule };

    // Snapshot
    try {
      revisionQueries.create.run({ id: generateId(), prefId: id, userId, category: pref.category, rule: pref.rule, version: 1 });
    } catch (_) {}

    fireWebhook(userId, "preference.created", { preference: row, source: `bundle:${bundleId}` });
    imported++;
  }

  res.json({
    success:  true,
    imported,
    skipped,
    bundle:   bundle.name,
  });
});

export default router;
