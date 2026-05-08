import fs from "fs";
import type { Response } from "express";

const isProd = process.env.NODE_ENV === "production";

/**
 * Send an HTML file with dev-friendly cache headers so local edits show up without a hard refresh.
 * In development, sets `X-Page-Updated` to the file mtime (Unix seconds) — check Network → Response Headers.
 */
export function sendHtmlFile(res: Response, filePath: string): void {
  if (!isProd) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    try {
      const mtimeSec = Math.floor(fs.statSync(filePath).mtimeMs / 1000);
      res.setHeader("X-Page-Updated", String(mtimeSec));
    } catch {
      /* ignore missing file until sendFile fails */
    }
  }
  res.sendFile(filePath);
}
