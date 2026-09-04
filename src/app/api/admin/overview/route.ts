import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"

// GET /api/admin/overview — platform-level counts for the admin
// dashboard. No message content is ever exposed here.
export async function GET() {
  try {
    await requirePlatformAdmin()
    const admin = billingAdmin()

    const [accounts, profiles, plans, subs, events] = await Promise.all([
      admin.from("accounts").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("user_id", { count: "exact", head: true }),
      admin.from("plans").select("id", { count: "exact", head: true }),
      admin.from("subscriptions").select("status"),
      admin
        .from("billing_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
    ])

    const byStatus: Record<string, number> = {}
    for (const s of subs.data ?? []) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
    }

    return NextResponse.json({
      workspaces: accounts.count ?? 0,
      users: profiles.count ?? 0,
      plans: plans.count ?? 0,
      subscriptions: byStatus,
      failed_billing_events: events.count ?? 0,
    })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
