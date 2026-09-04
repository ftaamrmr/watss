import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"

// GET /api/admin/audit — newest platform audit events.
export async function GET() {
  try {
    await requirePlatformAdmin()
    const admin = billingAdmin()
    const { data, error } = await admin
      .from("audit_logs")
      .select("id, actor_user_id, action, target_type, target_id, account_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
