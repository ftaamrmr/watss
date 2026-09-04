// ============================================================
// Usage tracking — metered resources (messages, AI, API, broadcasts)
// are counted monthly through the atomic check_and_increment_usage
// RPC, so concurrent requests cannot overshoot a quota.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"
import { PlanLimitError } from "@/lib/entitlements"
import { METRIC_LIMIT_KEY, type QuotaResult, type UsageMetric } from "@/lib/billing/types"

/**
 * Atomically check the plan quota for `metric` and increment usage by
 * `amount` in a single DB round trip. Throws PlanLimitError when the
 * increment would exceed the plan's monthly cap.
 */
export async function meterUsage(
  accountId: string,
  metric: UsageMetric,
  amount = 1,
  client?: SupabaseClient,
): Promise<QuotaResult> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase.rpc("check_and_increment_usage", {
    target_account_id: accountId,
    target_metric: metric,
    limit_key: METRIC_LIMIT_KEY[metric],
    amount,
  })
  if (error) throw new Error(`check_and_increment_usage failed: ${error.message}`)
  const result = data as QuotaResult
  if (!result.allowed) {
    throw new PlanLimitError(METRIC_LIMIT_KEY[metric], result.limit, result.used)
  }
  return result
}

/** Best-effort increment that never throws — for metering paths that
 *  must not fail the user action (e.g. inbound webhook accounting). */
export async function trackUsage(
  accountId: string,
  metric: UsageMetric,
  amount = 1,
  client?: SupabaseClient,
): Promise<void> {
  try {
    await meterUsage(accountId, metric, amount, client)
  } catch (err) {
    if (err instanceof PlanLimitError) {
      console.warn(`[usage] quota reached for ${metric} on account ${accountId}`)
      return
    }
    console.error(`[usage] tracking failed for ${metric}:`, err)
  }
}

export interface UsageBucket {
  metric: string
  used: number
  period_start: string
  period_end: string
}

/** Current-month usage rows for an account. */
export async function getCurrentUsage(
  accountId: string,
  client?: SupabaseClient,
): Promise<UsageBucket[]> {
  const supabase = client ?? billingAdmin()
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from("usage_counters")
    .select("metric, used, period_start, period_end")
    .eq("account_id", accountId)
    .eq("period_start", start.toISOString().slice(0, 10))
  if (error) throw new Error(`usage read failed: ${error.message}`)
  return (data ?? []) as UsageBucket[]
}
