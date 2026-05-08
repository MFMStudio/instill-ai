/**
 * Instill AI — Outbound webhook dispatcher
 * Fires preference.created | preference.updated | preference.deleted events
 * with HMAC-SHA256 signatures. Retries up to 3 times with exponential backoff.
 */
import crypto from "crypto";
import { webhookQueries, generateId } from "./db";

export type WebhookEventType =
  | "preference.created"
  | "preference.updated"
  | "preference.deleted";

export interface WebhookPayload {
  event: WebhookEventType;
  ts: string;
  data: Record<string, unknown>;
}

function sign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function deliver(
  endpointId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  attempt = 1
): Promise<void> {
  const body = JSON.stringify(payload);
  const sig  = sign(secret, body);
  const deliveryId = generateId();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Instill-Signature": sig,
        "X-Instill-Event": payload.event,
        "X-Instill-Delivery": deliveryId,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });

    const status = res.ok ? 1 : 0;
    webhookQueries.logDelivery.run({
      id: deliveryId,
      endpointId,
      eventType: payload.event,
      payload: body,
      status,
      attempts: attempt,
      lastAttemptAt: new Date().toISOString(),
    });

    if (!res.ok && attempt < 3) {
      const delay = attempt * 2000; // 2s, 4s
      setTimeout(() => deliver(endpointId, url, secret, payload, attempt + 1), delay);
    }
  } catch (_err) {
    webhookQueries.logDelivery.run({
      id: deliveryId,
      endpointId,
      eventType: payload.event,
      payload: body,
      status: 0,
      attempts: attempt,
      lastAttemptAt: new Date().toISOString(),
    });

    if (attempt < 3) {
      const delay = attempt * 2000;
      setTimeout(() => deliver(endpointId, url, secret, payload, attempt + 1), delay);
    }
  }
}

/**
 * Fire an event to all enabled webhook endpoints for a user.
 * Non-blocking — errors are logged to webhook_deliveries, never thrown.
 */
export function fireWebhook(userId: number, event: WebhookEventType, data: Record<string, unknown>): void {
  try {
    const endpoints = webhookQueries.listAllEnabled.all() as any[];
    const userEndpoints = endpoints.filter((e) => e.user_id === userId);
    if (!userEndpoints.length) return;

    const payload: WebhookPayload = {
      event,
      ts: new Date().toISOString(),
      data,
    };

    for (const ep of userEndpoints) {
      const epEvents: string[] = JSON.parse(ep.events || "[]");
      if (!epEvents.includes(event)) continue;
      // Fire & forget — don't await
      deliver(ep.id, ep.url, ep.secret, payload).catch(() => {});
    }
  } catch (_err) {
    // Never throw from webhook dispatch — it's a side effect
  }
}
