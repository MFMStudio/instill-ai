import { Request, Response, NextFunction } from "express";
import { userQueries } from "./db";

declare module "express-session" {
  interface SessionData {
    userId: number;
    email: string;
    isAdmin: boolean;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    /** API routes must return JSON — redirects break fetch('/api/...') from marketing pages (session looks "missing"). */
    const url = req.originalUrl || req.url || "";
    if (url.startsWith("/api")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.redirect("/login");
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId || !req.session.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const apiKey = authHeader.slice(7);
  const user = userQueries.findByApiKey.get(apiKey) as any;
  if (!user) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  (req as any).mcpUser = user;
  next();
}
