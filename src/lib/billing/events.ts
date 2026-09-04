// ============================================================
// Billing event journal — idempotency for provider webhooks.
// Providers retry; the UNIQUE(provider, event_id) constraint makes
// duplicate delivery a safe no-op.
// ============================================================

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "./admin-client"
import type { VerifiedWebhook } from "./provider"

export type BillingEventStatus = "processed" | "duplicate" | "failed" | "ignored"

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

/**
 * Record a verified webhook. Returns 'duplicate' without side effects
 * when this (provider, event_id) was already processed.
 */
export async function recordBillingEvent(
  provider: string,
  event: VerifiedWebhook,
  status: BillingEventStatus = "processed",
  error?: string,
  client?: SupabaseClient,
): Promise<{ status: BillingEventStatus; id: string | null }> {
  const supabase = client ?? billingAdmin()
  const { data, error: insertErr } = await supabase
    .from("billing_events")
    .insert({
      provider,
      event_id: event.eventId,
      event_type: event.eventType,
      account_id: event.accountId,
      payload_hash: hashPayload(event.payload),
      metadata: {
        provider_subscription_id: event.providerSubscriptionId,
        provider_customer_id: event.providerCustomerId,
        status: event.status,
      },
      status,
      error: error ?? null,
      processed_at: status === "processed" ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle()

  if (insertErr) {
    // 23505 = unique violation → provider retried an event we
    // already journaled. Safe no-op.
    if ((insertErr as { code?: string }).code === "23505") {
      return { status: "duplicate", id: null }
    }
    throw new Error(`billing_events insert failed: ${insertErr.message}`)
  }
  return { status, id: data?.id ?? null }
}
