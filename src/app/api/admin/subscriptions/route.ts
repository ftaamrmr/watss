import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"
import { audit } from "@/lib/audit"

// POST /api/admin/subscriptions — platform-admin subscription ops.
// This is the manual-billing path used while no payment provider is
// configured: the operator collects payment off-band, then activates
// here. Body:
//   { accountId, planId, action: "activate" | "extend_trial",
//     billingCycle?, trialDays? }
export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin()
    const body = await request.json().catch(() => ({}))
    const { accountId, planId, action } = body ?? {}
    if (typeof accountId !== "string" || (action !== "activate" && action !== "extend_trial")) {
      return NextResponse.json({ error: "accountId and valid action required" }, { status: 400 })
    }

    const admin = billingAdmin()
    const { data: sub, error } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    if (action === "extend_trial") {
      const days = Number(body?.trialDays)
      if (!sub || !Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ error: "trialDays must be a positive number" }, { status: 400 })
      }
      const until = new Date(Date.now() + days * 86_400_000).toISOString()
      await admin
        .from("subscriptions")
        .update({ status: "trialing", trial_ends_at: until, current_period_end: until })
        .eq("id", sub.id)
      await audit({
        actorUserId: userId,
        action: "admin.trial_extended",
        targetType: "subscription",
        targetId: sub.id,
        accountId,
        metadata: { days },
      })
      return NextResponse.json({ ok: true, trial_ends_at: until })
    }

    // activate
    if (typeof planId !== "string") {
      return NextResponse.json({ error: "planId is required" }, { status: 400 })
    }
    const cycle = body?.billingCycle === "yearly" ? "yearly" : "monthly"
    const periodEnd = new Date(
      Date.now() + (cycle === "yearly" ? 365 : 30) * 86_400_000,
    ).toISOString()

    if (sub) {
      await admin
        .from("subscriptions")
        .update({
          plan_id: planId,
          status: "active",
          billing_cycle: cycle,
          cancel_at_period_end: false,
          cancelled_at: null,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
        })
        .eq("id", sub.id)
    } else {
      await admin.from("subscriptions").insert({
        account_id: accountId,
        plan_id: planId,
        status: "active",
        billing_cycle: cycle,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
      })
    }

    await audit({
      actorUserId: userId,
      action: "admin.subscription_activated",
      targetType: "subscription",
      targetId: sub?.id ?? null,
      accountId,
      metadata: { plan_id: planId, billing_cycle: cycle },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
