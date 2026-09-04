import { NextResponse } from "next/server"
import { getPaymentProvider, PaymentProviderUnavailable } from "@/lib/billing/provider"
import { recordBillingEvent } from "@/lib/billing/events"
import { billingAdmin } from "@/lib/billing/admin-client"
import { audit } from "@/lib/audit"

// POST /api/billing/webhooks/[provider]
//
// The ONLY path that activates/changes paid subscriptions. Signature
// is verified by the provider implementation; events are journaled
// idempotently (UNIQUE provider+event_id) so retries are no-ops.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerCode } = await params
  const provider = getPaymentProvider(providerCode)
  if (!provider.isConfigured()) {
    return NextResponse.json({ error: "Provider not configured" }, { status: 503 })
  }

  const rawBody = await request.text()
  let event
  try {
    event = await provider.verifyWebhook(rawBody, request.headers)
  } catch (err) {
    if (err instanceof PaymentProviderUnavailable) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    // Signature failure — do not leak details.
    console.warn(`[billing webhook:${providerCode}] verification failed`)
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const journal = await recordBillingEvent(provider.code, event)
  if (journal.status === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Apply the subscription state change implied by the event.
  try {
    await applyBillingEvent(event)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[billing webhook:${providerCode}] apply failed:`, err)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}

async function applyBillingEvent(event: {
  eventType: string
  accountId: string | null
  providerSubscriptionId: string | null
  status: string | null
}) {
  if (!event.accountId && !event.providerSubscriptionId) return
  const admin = billingAdmin()

  const lookup = admin
    .from("subscriptions")
    .select("id, account_id, status")
    .in("status", ["trialing", "active", "past_due"])
  const { data: sub } = event.accountId
    ? await lookup.eq("account_id", event.accountId).limit(1).maybeSingle()
    : await lookup
        .eq("provider_subscription_id", event.providerSubscriptionId!)
        .limit(1)
        .maybeSingle()
  if (!sub) return

  const t = event.eventType
  if (t === "payment.succeeded" || t === "subscription.activated") {
    await admin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: new Date().toISOString(),
      })
      .eq("id", sub.id)
  } else if (t === "payment.failed" || t === "subscription.past_due") {
    // No data deletion — a warning state + grace period only.
    await admin.from("subscriptions").update({ status: "past_due" }).eq("id", sub.id)
  } else if (t === "subscription.cancelled") {
    await admin
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", sub.id)
  }

  await audit({
    action: "billing.webhook_applied",
    targetType: "subscription",
    targetId: sub.id,
    accountId: sub.account_id,
    metadata: { event_type: t },
  })
}
