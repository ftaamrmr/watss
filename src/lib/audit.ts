// ============================================================
// Platform audit log — sensitive actions leave a trail.
// NEVER log secrets, tokens, card data, or message content.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"

export interface AuditEntry {
  actorUserId?: string | null
  action: string
  targetType?: string
  targetId?: string
  accountId?: string | null
  metadata?: Record<string, unknown>
}

export async function audit(entry: AuditEntry, client?: SupabaseClient): Promise<void> {
  try {
    const supabase = client ?? billingAdmin()
    const { error } = await supabase.from("audit_logs").insert({
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      account_id: entry.accountId ?? null,
      metadata: entry.metadata ?? {},
    })
    if (error) console.error("[audit] insert failed:", error.message)
  } catch (err) {
    // Auditing must never break the business operation.
    console.error("[audit] unexpected failure:", err)
  }
}
