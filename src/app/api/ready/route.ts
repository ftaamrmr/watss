import { NextResponse } from "next/server"
import { billingAdmin } from "@/lib/billing/admin-client"

// GET /api/ready — readiness: the app can reach its database.
// Reports only ok/fail — never credentials, versions, or env values.
export async function GET() {
  try {
    const { error } = await billingAdmin()
      .from("plans")
      .select("id", { head: true, count: "exact" })
    if (error) throw error
    return NextResponse.json({ status: "ready" })
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503 })
  }
}
