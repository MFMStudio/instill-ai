/** Strip phone to E.164-friendly digits + optional leading + */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/[^\d+]/g, "");
  if (digits.length < 8) return null;
  return digits.length > 30 ? digits.slice(0, 30) : digits;
}

export async function syncStripeCustomerBilling(opts: {
  stripe: { customers: { update: (id: string, params: Record<string, unknown>) => Promise<unknown> } };
  stripeCustomerId: string | null | undefined;
  email: string;
  fullName: string | null | undefined;
  phone: string | null | undefined;
  company: string | null | undefined;
  userId: number;
}): Promise<void> {
  const id = opts.stripeCustomerId?.trim();
  if (!id) return;

  const name =
    (opts.fullName && String(opts.fullName).trim()) ||
    opts.email.split("@")[0] ||
    undefined;

  const meta: Record<string, string> = { userId: String(opts.userId) };
  const co = opts.company?.trim();
  if (co) meta.company = co;

  await opts.stripe.customers.update(id, {
    email: opts.email,
    name: name || undefined,
    phone: opts.phone?.trim() || undefined,
    metadata: meta,
  });
}
