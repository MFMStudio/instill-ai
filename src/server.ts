import express from "express";
import session from "express-session";
import path from "path";
import rateLimit from "express-rate-limit";
import { requireAuth, requireAdmin, requireApiKey } from "./auth";
import authRoutes from "./routes/auth";
import apiRoutes from "./routes/api";
import checkoutRoutes from "./routes/checkout";
import webhookRoutes from "./routes/webhooks";
import bundleRoutes from "./routes/bundles";
import { handleMcpRequest } from "./mcp-handler";
import { sendHtmlFile } from "./sendHtml";
import { metricsMiddleware, purgeOldMetrics } from "./metrics";
import metricsRoutes from "./routes/metrics";
import auditRoutes from "./routes/audit";
import workflowRoutes from "./routes/workflow";

const app = express();
const PORT = Number(process.env.PORT) || 3500;
const publicRoot = path.join(__dirname, "../public");
const homeHtml = path.resolve(publicRoot, "home.html");
const isProd = process.env.NODE_ENV === "production";

// Trust the first proxy (Cloudflare / Railway ingress) so that
// req.secure is true and secure session cookies are set correctly.
app.set("trust proxy", 1);

// ── Structured logger ──────────────────────────────────────────────────────
function log(level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) {
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  if (level === "ERROR") console.error(JSON.stringify(entry));
  else if (level === "WARN") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// Request logger middleware
app.use((req, _res, next) => {
  log("INFO", "request", { method: req.method, path: req.path, ip: req.ip });
  next();
});

// Metrics middleware — aggregate counters, no rule body
app.use(metricsMiddleware);

// ── Security headers ───────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
});

// ── Rate limiters ──────────────────────────────────────────────────────────
// Auth endpoints — strict: 10 requests / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
  handler(req, res, _next, options) {
    log("WARN", "rate_limit_hit", { path: req.path, ip: req.ip });
    res.status(429).json(options.message);
  },
});

// MCP / API endpoints — relaxed: 300 requests / min per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down and try again shortly." },
});

// Apply auth rate limiter to login/register
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);

// ⚠ Stripe webhook MUST be before express.json() — needs raw body
app.use("/webhooks/stripe", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// ── Session ────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || "ai-consistency-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    name: "instill.sid",          // don't leak default connect.sid
    cookie: {
      secure: isProd,             // HTTPS-only in prod
      httpOnly: true,             // no JS access
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use(authRoutes);
app.use(apiRoutes);
app.use(checkoutRoutes);
app.use(webhookRoutes);
app.use(bundleRoutes);
app.use(metricsRoutes);
app.use(auditRoutes);
app.use(workflowRoutes);

// ── HTML pages ─────────────────────────────────────────────────────────────
function sendMarketingHome(_req: express.Request, res: express.Response): void {
  sendHtmlFile(res, homeHtml);
}

app.get("/",       sendMarketingHome);
app.get("/home",   sendMarketingHome);
app.get("/home/",  sendMarketingHome);

app.get("/pricing",      (_req, res) => sendHtmlFile(res, path.join(publicRoot, "pricing.html")));
app.get("/roadmap",      (_req, res) => sendHtmlFile(res, path.join(publicRoot, "roadmap.html")));
app.get("/integrations", (_req, res) => sendHtmlFile(res, path.join(publicRoot, "integrations.html")));
app.get("/privacy",      (_req, res) => sendHtmlFile(res, path.join(publicRoot, "privacy.html")));
app.get("/terms",        (_req, res) => sendHtmlFile(res, path.join(publicRoot, "terms.html")));

app.get("/dashboard",         requireAuth,  (_req, res) => sendHtmlFile(res, path.join(publicRoot, "dashboard.html")));
app.get("/setup",             requireAuth,  (_req, res) => sendHtmlFile(res, path.join(publicRoot, "setup.html")));
app.get("/admin",             requireAdmin, (_req, res) => sendHtmlFile(res, path.join(publicRoot, "admin.html")));
app.get("/metrics",           requireAdmin, (_req, res) => sendHtmlFile(res, path.join(publicRoot, "metrics.html")));
app.get("/tools",             requireAuth,  (_req, res) => sendHtmlFile(res, path.join(publicRoot, "tools.html")));
app.get("/checkout/success",  requireAuth,  (_req, res) => sendHtmlFile(res, path.join(publicRoot, "checkout-success.html")));

// ── Static assets ──────────────────────────────────────────────────────────
app.use(
  express.static(publicRoot, {
    index: false,
    fallthrough: true,
    setHeaders(res, filePath) {
      if (!isProd) {
        const ext = path.extname(filePath).toLowerCase();
        if ([".css", ".js", ".map", ".json"].includes(ext)) {
          res.setHeader("Cache-Control", "no-store");
        }
      }
    },
  })
);

// ── MCP endpoint (rate limited) ────────────────────────────────────────────
app.post("/mcp", requireApiKey, apiLimiter, handleMcpRequest);
app.get("/mcp",  requireApiKey, apiLimiter, handleMcpRequest);

// ── OpenAPI spec ───────────────────────────────────────────────────────────
app.get("/openapi.json", (_req, res) => {
  const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  res.json({
    openapi: "3.1.0",
    info: { title: "Instill AI — Preference API", version: "2.1.0" },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/preferences": {
        get: {
          operationId: "getPreferences",
          summary: "List all preferences",
          security: [{ apiKey: [] }],
          responses: { "200": { description: "Preferences grouped by category" } },
        },
        post: {
          operationId: "savePreference",
          summary: "Save a new preference",
          security: [{ apiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    rule: { type: "string" },
                  },
                  required: ["category", "rule"],
                },
              },
            },
          },
          responses: { "200": { description: "Saved preference" } },
        },
      },
      "/api/preferences/{id}": {
        put: {
          operationId: "updatePreference",
          summary: "Update an existing preference",
          security: [{ apiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          operationId: "deletePreference",
          summary: "Delete a preference",
          security: [{ apiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" } },
        },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
    },
  });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log("ERROR", "unhandled_error", { path: req.path, error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ── Boot ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT, env: process.env.NODE_ENV || "development" });
  if (!process.env.SESSION_SECRET) {
    log("WARN", "insecure_session_secret", { msg: "Set SESSION_SECRET env var before going to production" });
  }
  // Purge old metrics once per day (run on boot, then every 24h)
  purgeOldMetrics();
  setInterval(purgeOldMetrics, 24 * 60 * 60 * 1000);
});

export { log };
