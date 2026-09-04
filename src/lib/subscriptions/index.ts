// ============================================================
// Subscriptions — lifecycle for the per-tenant subscription.
// Status mutations from payment providers happen ONLY via verified
// webhooks; this module covers trial bootstrap, manual/admin
// activation, and cancellation policy.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"
import type { BillingCycle, Subscription, SubscriptionStatus } from "@/lib/billing/types"

/** Current live subscription (trialing/active/past_due) or null. */
export async function getLiveSubscription(
  accountId: string,
  client?: SupabaseClient,
): Promise<Subscription | null> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`subscription read failed: ${error.message}`)
  return (data as Subscription) ?? null
}

/** Bootstrap a trial on the default plan (idempotent — DB enforces). */
export async function ensureTrialSubscription(
  accountId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? billingAdmin()
  const { error } = await supabase.rpc("create_trial_subscription", {
    target_account_id: accountId,
  })
  if (error) throw new Error(`trial creation failed: ${error.message}`)
}

/**
 * Pure status-transition guard used by tests and by the admin/billing
 * routes before they write. Returns the next status or null when the
 * transition is not allowed.
 */
export function nextStatus(
  current: SubscriptionStatus,
  action: "payment_succeeded" | "payment_failed" | "cancel" | "expire" | "suspend" | "unsuspend",
): SubscriptionStatus | null {
  const t: Record<string, Partial<Record<SubscriptionStatus, SubscriptionStatus>>> = {
    payment_succeeded: { trialing: "active", active: "active", past_due: "active" },
    payment_failed: { active: "past_due", trialing: "past_due" },
    cancel: { trialing: "cancelled", active: "cancelled", past_due: "cancelled" },
    expire: { trialing: "expired", active: "expired", past_due: "expired" },
    suspend: { trialing: "suspended", active: "suspended", past_due: "suspended" },
    unsuspend: { suspended: "active" },
  }
  return t[action]?.[current] ?? null
}

/** Admin/manual activation (used while no payment provider exists). */
export async function activateSubscription(
  accountId: string,
  planId: string,
  billingCycle: BillingCycle = "monthly",
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? billingAdmin()
  const periodEnd = new Date(
    Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86_400_000,
  ).toISOString()
  const existing = await getLiveSubscription(accountId, supabase)
  if (existing) {
    const { error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: planId,
        status: "active",
        billing_cycle: billingCycle,
        cancel_at_period_end: false,
        cancelled_at: null,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
      })
      .eq("id", existing.id)
    if (error) throw new Error(`activation failed: ${error.message}`)
  } else {
    const { error } = await supabase.from("subscriptions").insert({
      account_id: accountId,
      plan_id: planId,
      status: "active",
      billing_cycle: billingCycle,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd,
    })
    if (error) throw new Error(`activation failed: ${error.message}`)
  }
}
