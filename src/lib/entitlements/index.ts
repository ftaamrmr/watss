// ============================================================
// Entitlements — the single source of truth for "what can this
// account do?". Business logic must NEVER branch on plan names or
// codes (`if plan.code === 'PRO'` is banned); it asks these
// functions instead.
//
// Pure helpers are exported separately from the RPC-backed ones so
// the decision logic stays unit-testable without a database.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"
import type { Entitlements, LimitKey, QuotaResult } from "@/lib/billing/types"

// ------------------------------------------------------------
// Errors — API routes map these to 402/403 + a machine-readable
// `code` the client translates (billing.limit_reached etc.).
// ------------------------------------------------------------

export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT_EXCEEDED"
  constructor(
    public readonly resource: string,
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`Plan limit reached for ${resource} (${used}/${limit})`)
    this.name = "PlanLimitError"
  }
}

export class SubscriptionInactiveError extends Error {
  readonly code = "SUBSCRIPTION_INACTIVE"
  constructor(public readonly status: string) {
    super(`Subscription is ${status}`)
    this.name = "SubscriptionInactiveError"
  }
}

// ------------------------------------------------------------
// Pure decision logic
// ------------------------------------------------------------

export const UNLIMITED = -1

export function isUnlimited(limit: number | undefined | null): boolean {
  return limit === undefined || limit === null || limit < 0
}

/** Effective numeric limit for a resource; -1 = unlimited. */
export function getLimitValue(ent: Entitlements, key: LimitKey | string): number {
  const v = ent?.limits?.[key]
  return typeof v === "number" ? v : UNLIMITED
}

/** Boolean feature flag from the plan (default false). */
export function canUseFeature(ent: Entitlements, feature: string): boolean {
  return ent?.features?.[feature] === true
}

/**
 * Whether new usage of `amount` fits under `limit` given `used`.
 */
export function quotaAllows(used: number, limit: number, amount = 1): boolean {
  if (isUnlimited(limit)) return true
  return used + amount <= limit
}

/** Statuses that permit normal product usage (reads always allowed). */
export const ACTIVE_STATUSES = ["trialing", "active"] as const

/** Past-due accounts keep working during the grace period. */
export const GRACE_STATUSES = ["past_due"] as const

/** Reads allowed everywhere; writes restricted when not active/grace. */
export function canWrite(ent: Entitlements): boolean {
  return (
    ACTIVE_STATUSES.includes(ent.status as never) ||
    GRACE_STATUSES.includes(ent.status as never)
  )
}

export function isTrialing(ent: Entitlements): boolean {
  return ent.status === "trialing"
}

/** Whole days left in the trial; 0 when not trialing/expired. */
export function trialDaysRemaining(ent: Entitlements, now = new Date()): number {
  if (ent.status !== "trialing" || !ent.trial_ends_at) return 0
  const ms = new Date(ent.trial_ends_at).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

// ------------------------------------------------------------
// RPC-backed accessors
// ------------------------------------------------------------

export async function getEntitlements(
  accountId: string,
  client?: SupabaseClient,
): Promise<Entitlements> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase.rpc("get_entitlements", {
    target_account_id: accountId,
  })
  if (error) throw new Error(`get_entitlements failed: ${error.message}`)
  return data as Entitlements
}

export async function getLimit(accountId: string, key: LimitKey): Promise<number> {
  return getLimitValue(await getEntitlements(accountId), key)
}

/**
 * Count-based quota check (contacts, automations, …). Caller supplies
 * the current count; the DB applies the plan's cap.
 */
export async function checkQuota(
  accountId: string,
  key: LimitKey,
  currentCount: number,
  client?: SupabaseClient,
): Promise<QuotaResult> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase.rpc("check_plan_limit", {
    target_account_id: accountId,
    limit_key: key,
    current_count: currentCount,
  })
  if (error) throw new Error(`check_plan_limit failed: ${error.message}`)
  return data as QuotaResult
}

/** Like checkQuota but throws PlanLimitError when exceeded. */
export async function assertQuota(
  accountId: string,
  key: LimitKey,
  currentCount: number,
  client?: SupabaseClient,
): Promise<void> {
  const q = await checkQuota(accountId, key, currentCount, client)
  if (!q.allowed) throw new PlanLimitError(key, q.limit, q.used)
}

/**
 * Guard for write operations: throws SubscriptionInactiveError when
 * the subscription is expired/cancelled/suspended. Reads never call
 * this — data stays accessible forever.
 */
export async function assertWriteAccess(
  accountId: string,
  client?: SupabaseClient,
): Promise<Entitlements> {
  const ent = await getEntitlements(accountId, client)
  if (!canWrite(ent)) throw new SubscriptionInactiveError(ent.status)
  return ent
}
