// ============================================================
// Billing / subscription domain types.
// Mirrors migration 031_saas_foundation.sql.
// ============================================================

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "suspended"

export type BillingCycle = "monthly" | "yearly"

/** Known plan limit keys. -1 = unlimited. */
export type LimitKey =
  | "team_members"
  | "whatsapp_accounts"
  | "contacts"
  | "monthly_messages"
  | "broadcasts_per_month"
  | "automations"
  | "api_requests_per_month"
  | "webhook_endpoints"
  | "ai_requests_per_month"
  | "knowledge_documents"
  | "api_keys"

/** Known metered usage metrics (monthly buckets in usage_counters). */
export type UsageMetric = "messages" | "api_requests" | "ai_requests" | "broadcasts"

/** usage metric -> plan limit key */
export const METRIC_LIMIT_KEY: Record<UsageMetric, LimitKey> = {
  messages: "monthly_messages",
  api_requests: "api_requests_per_month",
  ai_requests: "ai_requests_per_month",
  broadcasts: "broadcasts_per_month",
}

export interface Plan {
  id: string
  code: string
  name_ar: string
  name_en: string
  description_ar: string | null
  description_en: string | null
  price_monthly: number
  price_yearly: number
  currency: string
  trial_days: number
  limits: Record<string, number>
  features: Record<string, boolean>
  is_active: boolean
  is_public: boolean
  is_default: boolean
  sort_order: number
}

export interface Subscription {
  id: string
  account_id: string
  plan_id: string
  status: SubscriptionStatus
  billing_cycle: BillingCycle
  currency: string
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  created_at: string
  updated_at: string
}

/** Shape returned by the get_entitlements RPC. */
export interface Entitlements {
  status: SubscriptionStatus | "none"
  plan_code: string | null
  plan_id?: string
  subscription_id?: string
  limits: Record<string, number>
  features: Record<string, boolean>
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end?: boolean
  billing_cycle?: BillingCycle
}

export interface QuotaResult {
  allowed: boolean
  used: number
  limit: number // -1 = unlimited
  status?: string
}
