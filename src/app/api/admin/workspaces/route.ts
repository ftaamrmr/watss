import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"
import { audit } from "@/lib/audit"

// GET /api/admin/workspaces — every tenant with owner, plan,
// subscription status, trial end and usage summary. Message content
// is never included.
export async function GET() {
  try {
    await requirePlatformAdmin()
    const admin = billingAdmin()

    const { data: accounts, error } = await admin
      .from("accounts")
      .select("id, name, country, timezone, preferred_language, owner_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) throw error

    const accountIds = (accounts ?? []).map((a) => a.id)
    const [subs, usage, wa] = await Promise.all([
      admin
        .from("subscriptions")
        .select("account_id, status, trial_ends_at, current_period_end, plan_id")
        .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"])
        .in("status", ["trialing", "active", "past_due"]),
      admin
        .from("usage_counters")
        .select("account_id, metric, used")
        .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("whatsapp_config")
        .select("account_id, status")
        .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]),
    ])

    const planIds = [...new Set((subs.data ?? []).map((s) => s.plan_id))]
    const { data: plans } = planIds.length
      ? await admin.from("plans").select("id, code, name_en, name_ar").in("id", planIds)
      : { data: [] }
    const planById = new Map((plans ?? []).map((p) => [p.id, p]))

    const rows = (accounts ?? []).map((a) => {
      const sub = (subs.data ?? []).find((s) => s.account_id === a.id)
      const usageRows = (usage.data ?? []).filter((u) => u.account_id === a.id)
      const waRow = (wa.data ?? []).find((w) => w.account_id === a.id)
      return {
        ...a,
        subscription: sub
          ? { ...sub, plan: sub.plan_id ? (planById.get(sub.plan_id) ?? null) : null }
          : null,
        usage: usageRows,
        whatsapp_status: waRow?.status ?? "disconnected",
      }
    })

    return NextResponse.json({ workspaces: rows })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}

// POST /api/admin/workspaces — sensitive workspace actions.
// Body: { accountId, action: "suspend" | "unsuspend" }
export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin()
    const body = await request.json().catch(() => ({}))
    const accountId = typeof body?.accountId === "string" ? body.accountId : null
    const action = body?.action
    if (!accountId || (action !== "suspend" && action !== "unsuspend")) {
      return NextResponse.json({ error: "accountId and a valid action are required" }, { status: 400 })
    }

    const admin = billingAdmin()
    const status = action === "suspend" ? "suspended" : null

    const { data: sub, error } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!sub) return NextResponse.json({ error: "Workspace has no subscription" }, { status: 404 })

    if (action === "suspend") {
      await admin.from("subscriptions").update({ status: "suspended" }).eq("id", sub.id)
    } else {
      // Unsuspend returns the workspace to 'active'; the lazy
      // effective-status function still honours expired periods.
      await admin
        .from("subscriptions")
        .update({ status: sub.status === "suspended" ? "active" : sub.status })
        .eq("id", sub.id)
    }

    await audit({
      actorUserId: userId,
      action: `admin.workspace_${action}`,
      targetType: "account",
      targetId: accountId,
      accountId,
      metadata: { previous_status: sub.status, new_status: status ?? "active" },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
