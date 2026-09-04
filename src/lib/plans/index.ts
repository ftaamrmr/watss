// ============================================================
// Plans — the sellable catalog. Business logic must never branch on
// plan names/codes; it reads limits/features through entitlements.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"
import type { Plan } from "@/lib/billing/types"

/** Public, active plans for the pricing/upgrade UI (ordered). */
export async function listPublicPlans(client?: SupabaseClient): Promise<Plan[]> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true })
  if (error) throw new Error(`plans read failed: ${error.message}`)
  return (data ?? []) as Plan[]
}

/** The plan new trials default to (is_default, else lowest sort). */
export async function getDefaultPlan(client?: SupabaseClient): Promise<Plan | null> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`default plan read failed: ${error.message}`)
  return (data as Plan) ?? null
}
