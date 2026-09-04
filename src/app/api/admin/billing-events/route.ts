import { NextResponse } from "next/server"
import { requirePlatformAdmin, toAdminErrorResponse } from "@/lib/admin"
import { billingAdmin } from "@/lib/billing/admin-client"

// GET /api/admin/billing-events — provider webhook journal
// (incl. failed/duplicate deliveries for debugging).
export async function GET() {
  try {
    await requirePlatformAdmin()
    const admin = billingAdmin()
    const { data, error } = await admin
      .from("billing_events")
      .select("id, provider, event_id, event_type, account_id, status, error, processed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    return toAdminErrorResponse(err)
  }
}
