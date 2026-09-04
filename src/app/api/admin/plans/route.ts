import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"
import { audit } from "@/lib/audit"

const EDITABLE = new Set([
  "code", "name_ar", "name_en", "description_ar", "description_en",
  "price_monthly", "price_yearly", "currency", "trial_days",
  "limits", "features", "is_active", "is_public", "is_default", "sort_order",
])

// GET /api/admin/plans — all plans incl. inactive (management view).
export async function GET() {
  try {
    await requirePlatformAdmin()
    const admin = billingAdmin()
    const { data, error } = await admin
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true })
    if (error) throw error
    return NextResponse.json({ plans: data ?? [] })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}

// POST /api/admin/plans — create a plan.
export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin()
    const body = await request.json().catch(() => ({}))
    if (!body?.code || !body?.name_ar || !body?.name_en) {
      return NextResponse.json({ error: "code, name_ar and name_en are required" }, { status: 400 })
    }
    const row: Record<string, unknown> = {}
    for (const k of Object.keys(body)) if (EDITABLE.has(k)) row[k] = body[k]

    const admin = billingAdmin()
    const { data, error } = await admin.from("plans").insert(row).select("id").single()
    if (error) throw error

    await audit({
      actorUserId: userId,
      action: "admin.plan_created",
      targetType: "plan",
      targetId: data.id,
      metadata: { code: row.code },
    })
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}

// PATCH /api/admin/plans — edit a plan. Body: { id, ...fields }.
// Plans with live subscriptions are edited in place (new terms apply
// to renewals); destructive delete is intentionally not offered —
// deactivate instead.
export async function PATCH(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin()
    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === "string" ? body.id : null
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const patch: Record<string, unknown> = {}
    for (const k of Object.keys(body)) if (EDITABLE.has(k) && k !== "id") patch[k] = body[k]
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 })
    }

    const admin = billingAdmin()
    const { error } = await admin.from("plans").update(patch).eq("id", id)
    if (error) throw error

    await audit({
      actorUserId: userId,
      action: "admin.plan_updated",
      targetType: "plan",
      targetId: id,
      metadata: { fields: Object.keys(patch) },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
