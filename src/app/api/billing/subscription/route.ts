import { NextResponse } from "next/server"
import { requireRole, toErrorResponse } from "@/lib/auth/account"
import { getEntitlements } from "@/lib/entitlements"
import { getCurrentUsage } from "@/lib/usage"

// GET /api/billing/subscription — the caller's account subscription,
// entitlements snapshot and current-month usage. Any member may read;
// mutations live on the owner-only routes.
export async function GET() {
  try {
    const ctx = await requireRole("viewer")
    const supabase = ctx.supabase

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("account_id", ctx.accountId)
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    let plan = null
    if (subscription?.plan_id) {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("id", subscription.plan_id)
        .maybeSingle()
      plan = data
    }

    const entitlements = await getEntitlements(ctx.accountId)
    const usage = await getCurrentUsage(ctx.accountId)

    return NextResponse.json({ subscription, plan, entitlements, usage })
  } catch (err) {
    return toErrorResponse(err)
  }
}
