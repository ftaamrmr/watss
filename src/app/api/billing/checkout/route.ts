import { NextResponse } from "next/server"
import { requireRole, toErrorResponse } from "@/lib/auth/account"
import { getPaymentProvider, PaymentProviderUnavailable } from "@/lib/billing/provider"
import { resolveAppUrl } from "@/lib/branding"
import { audit } from "@/lib/audit"

// POST /api/billing/checkout — start a hosted checkout for a plan.
// Fails closed (503) when no payment provider is configured; a
// redirect alone NEVER activates a subscription — only the verified
// provider webhook does.
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner")
    const body = await request.json().catch(() => ({}))
    const planId = typeof body?.planId === "string" ? body.planId : null
    const billingCycle = body?.billingCycle === "yearly" ? "yearly" : "monthly"
    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 })
    }

    const { data: plan, error } = await ctx.supabase
      .from("plans")
      .select("id, is_active, is_public")
      .eq("id", planId)
      .maybeSingle()
    if (error) throw error
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

    const provider = getPaymentProvider()
    if (!provider.isConfigured()) {
      // Manual billing mode: the platform owner collects payment
      // off-band and activates the subscription from the admin panel.
      return NextResponse.json(
        { error: "Online payments are not configured", code: "PAYMENT_PROVIDER_UNAVAILABLE" },
        { status: 503 },
      )
    }

    const base = resolveAppUrl(request)
    const checkout = await provider.createCheckout({
      accountId: ctx.accountId,
      planId,
      billingCycle,
      successUrl: `${base}/settings/billing?checkout=success`,
      cancelUrl: `${base}/settings/billing?checkout=cancelled`,
      metadata: { account_id: ctx.accountId, plan_id: planId },
    })

    await audit({
      actorUserId: ctx.userId,
      action: "billing.checkout_started",
      targetType: "plan",
      targetId: planId,
      accountId: ctx.accountId,
      metadata: { billing_cycle: billingCycle, provider: provider.code },
    })

    return NextResponse.json(checkout)
  } catch (err) {
    if (err instanceof PaymentProviderUnavailable) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 })
    }
    return toErrorResponse(err)
  }
}
