import { NextResponse } from "next/server"
import { requireRole, toErrorResponse } from "@/lib/auth/account"
import { getPaymentProvider } from "@/lib/billing/provider"
import { billingAdmin } from "@/lib/billing/admin-client"
import { audit } from "@/lib/audit"

// POST /api/billing/cancel — default policy: cancel_at_period_end.
// The subscription stays usable until the paid period ends; no data
// is ever deleted by cancellation.
export async function POST() {
  try {
    const ctx = await requireRole("owner")
    const admin = billingAdmin()

    const { data: sub, error } = await admin
      .from("subscriptions")
      .select("id, status, provider, provider_subscription_id")
      .eq("account_id", ctx.accountId)
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!sub) return NextResponse.json({ error: "No active subscription" }, { status: 404 })

    // If the subscription lives at a provider, cancel there too.
    if (sub.provider && sub.provider_subscription_id) {
      const provider = getPaymentProvider(sub.provider)
      if (provider.isConfigured()) {
        await provider.cancelSubscription(sub.provider_subscription_id)
      }
    }

    const { error: updErr } = await admin
      .from("subscriptions")
      .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
      .eq("id", sub.id)
    if (updErr) throw updErr

    await audit({
      actorUserId: ctx.userId,
      action: "billing.subscription_cancel_requested",
      targetType: "subscription",
      targetId: sub.id,
      accountId: ctx.accountId,
      metadata: { cancel_at_period_end: true },
    })

    return NextResponse.json({ ok: true, cancel_at_period_end: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
