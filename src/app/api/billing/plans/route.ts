import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { toErrorResponse } from "@/lib/auth/account"

// GET /api/billing/plans — public, active plans for pricing/upgrade UI.
// Reads through the caller's session; RLS limits rows to
// is_active + is_public.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("plans")
      .select(
        "id, code, name_ar, name_en, description_ar, description_en, price_monthly, price_yearly, currency, trial_days, limits, features, is_default, sort_order",
      )
      .order("sort_order", { ascending: true })
    if (error) throw error
    return NextResponse.json({ plans: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
