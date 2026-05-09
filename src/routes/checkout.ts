import express from "express";
import Stripe from "stripe";
import { requireAuth } from "../auth";
import { userQueries } from "../db";
import { syncStripeCustomerBilling } from "../stripeSync";

const router = express.Router();

// ── Stripe client ────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "";
const STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || "";
const STRIPE_PRICE_BUSINESS = process.env.STRIPE_PRICE_BUSINESS || "";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" as any })
  : null;

function stripeEnabled(): boolean {
  return !!stripe && !!STRIPE_SECRET_KEY;
}

function getBaseUrl(req: express.Request): string {
  return process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
}

// ── Plan config ──────────────────────────────────────────────────────────────
const PLANS: Record<string, { priceId: string; name: string }> = {
  pro:      { priceId: STRIPE_PRICE_PRO,      name: "Pro"      },
  team:     { priceId: STRIPE_PRICE_TEAM,     name: "Team"     },
  business: { priceId: STRIPE_PRICE_BUSINESS, name: "Business" },
};

// ── POST /api/checkout/create-session ────────────────────────────────────────
router.post("/api/checkout/create-session", requireAuth, async (req, res) => {
  if (!stripeEnabled()) {
    res.status(503).json({ error: "Checkout is not configured on this deployment." });
    return;
  }

  const { plan } = req.body as { plan?: string };
  if (!plan || !PLANS[plan]) {
    res.status(400).json({ error: "Invalid plan. Choose 'pro', 'team', or 'business'." });
    return;
  }

  const planConfig = PLANS[plan];
  if (!planConfig.priceId) {
    res.status(503).json({ error: `Price ID for '${plan}' plan is not configured.` });
    return;
  }

  const sess = req.session as any;
  const user = userQueries.findById.get(sess.userId) as any;
  if (!user) { res.status(401).json({ error: "Not authenticated." }); return; }

  const base = getBaseUrl(req);

  try {
    // Re-use existing Stripe customer if present
    let customerId: string = user.stripe_customer_id || "";
    if (!customerId) {
      const meta: Record<string, string> = { userId: String(user.id) };
      const co = (user.company as string)?.trim?.();
      if (co) meta.company = co;
      const customer = await stripe!.customers.create({
        email: user.email,
        name: (user.full_name as string)?.trim?.() || undefined,
        phone: (user.phone as string)?.trim?.() || undefined,
        metadata: meta,
      });
      customerId = customer.id;
      userQueries.updatePlan.run({
        id: user.id,
        plan: user.plan || "free",
        stripeCustomerId: customerId,
        stripeSubscriptionId: user.stripe_subscription_id || null,
        planExpiresAt: user.plan_expires_at || null,
      });
    }

    await syncStripeCustomerBilling({
      stripe: stripe!,
      stripeCustomerId: customerId,
      email: user.email,
      fullName: user.full_name as string | undefined,
      phone: user.phone as string | undefined,
      company: user.company as string | undefined,
      userId: user.id,
    });

    // Phone/name here + Dashboard billing profile reduce mismatches. If checkout still shows SMS to the
    // wrong number, Stripe Link may have matched your email to another Link identity — try incognito,
    // another email for testing, or Dashboard → Settings → Payment methods → Link.

    const checkoutSession = await stripe!.checkout.sessions.create({
      customer: customerId,
      customer_update: { name: "auto", address: "auto", shipping: "auto" },
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      mode: "subscription",
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/pricing`,
      metadata: { userId: String(user.id), plan },
      subscription_data: { metadata: { userId: String(user.id), plan } },
      allow_promotion_codes: true,
    } as any);

    res.json({ url: (checkoutSession as any).url });
  } catch (err: any) {
    console.error("[Checkout] Error:", err.message);
    res.status(500).json({ error: err.message || "Failed to create checkout session." });
  }
});

// ── POST /api/checkout/portal ─────────────────────────────────────────────────
router.post("/api/checkout/portal", requireAuth, async (req, res) => {
  if (!stripeEnabled()) {
    res.status(503).json({ error: "Checkout is not configured on this deployment." });
    return;
  }

  const sess = req.session as any;
  const user = userQueries.findById.get(sess.userId) as any;
  if (!user?.stripe_customer_id) {
    res.status(400).json({ error: "No billing account found." });
    return;
  }

  const base = getBaseUrl(req);
  try {
    const portal = await (stripe!.billingPortal as any).sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${base}/dashboard`,
    });
    res.json({ url: portal.url });
  } catch (err: any) {
    console.error("[Checkout] Portal error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/checkout/status ──────────────────────────────────────────────────
router.get("/api/checkout/status", requireAuth, (req, res) => {
  const sess = req.session as any;
  const user = userQueries.findById.get(sess.userId) as any;
  res.json({
    plan:             user?.plan || "free",
    hasStripeCustomer: !!user?.stripe_customer_id,
    planExpiresAt:    user?.plan_expires_at || null,
  });
});

// ── POST /webhooks/stripe ─────────────────────────────────────────────────────
// Raw body required — /webhooks/stripe raw middleware registered in server.ts
router.post("/webhooks/stripe", async (req, res) => {
  if (!stripeEnabled()) { res.sendStatus(200); return; }

  const sig = req.headers["stripe-signature"] as string;
  let event: any;

  try {
    event = stripe!.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const userId = s.metadata?.userId;
        const plan   = s.metadata?.plan || "pro";
        if (userId) {
          userQueries.updatePlan.run({
            id: Number(userId),
            plan,
            stripeCustomerId:      s.customer || null,
            stripeSubscriptionId:  s.subscription || null,
            planExpiresAt:         null,
          });
          console.log(`[Webhook] User ${userId} → ${plan}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub       = event.data.object;
        const customerId = sub.customer;
        const plan       = sub.metadata?.plan || "pro";
        const active     = ["active", "trialing"].includes(sub.status);
        const expiresAt  = active ? null : new Date(sub.current_period_end * 1000).toISOString();
        userQueries.updatePlanByCustomerId.run({
          plan:                  active ? plan : "free",
          stripeSubscriptionId:  sub.id,
          planExpiresAt:         expiresAt,
          stripeCustomerId:      customerId,
        });
        console.log(`[Webhook] Sub updated: ${customerId} → ${active ? plan : "free"}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        userQueries.updatePlanByCustomerId.run({
          plan: "free", stripeSubscriptionId: null,
          planExpiresAt: null, stripeCustomerId: sub.customer,
        });
        console.log(`[Webhook] Sub cancelled: ${sub.customer} → free`);
        break;
      }

      case "invoice.payment_failed": {
        console.warn(`[Webhook] Payment failed: ${event.data.object.customer}`);
        break;
      }
    }
  } catch (err: any) {
    console.error("[Webhook] Handler error:", err.message);
    res.status(500).send("Handler error");
    return;
  }

  res.sendStatus(200);
});

export default router;
