import path from "path";
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { userQueries, generateApiKey } from "../db";
import { sendHtmlFile } from "../sendHtml";

const router = Router();
/** Resolve from dist/routes/auth.js → project public/ regardless of cwd. */
const loginPage = path.join(__dirname, "..", "..", "public", "login.html");

router.get("/login", (_req: Request, res: Response) => {
  /** Logged-in users can still open /login (e.g. switch account); no redirect away from marketing flow. */
  sendHtmlFile(res, loginPage);
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = userQueries.findByEmail.get(email);
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const count = (userQueries.count.get() as any).count;
  const isAdmin = count === 0 ? 1 : 0; // First user is admin

  const passwordHash = await bcrypt.hash(password, 12);
  const apiKey = generateApiKey();

  userQueries.create.run({ email, passwordHash, apiKey, isAdmin });

  const user = userQueries.findByEmail.get(email) as any;
  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.isAdmin = user.is_admin === 1;

  res.json({ success: true, redirect: "/dashboard" });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const user = userQueries.findByEmail.get(email) as any;
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.isAdmin = user.is_admin === 1;

  res.json({ success: true, redirect: "/dashboard" });
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ success: true }));
});

export default router;
