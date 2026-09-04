// ============================================================
// Platform admin (super admin) — the WATSS operator, distinct from
// workspace owners/admins. Membership lives in the platform_admins
// table (server-managed); never an email list or frontend flag.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { billingAdmin } from "@/lib/billing/admin-client"
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account"
import { NextResponse } from "next/server"

export class NotPlatformAdminError extends Error {
  readonly status = 403
  constructor() {
    super("Platform admin access required")
    this.name = "NotPlatformAdminError"
  }
}

export async function isPlatformAdmin(userId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = client ?? billingAdmin()
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(`platform_admins check failed: ${error.message}`)
  return !!data
}

/**
 * Guard for /api/admin/* routes. Resolves the caller's session and
 * requires platform-admin membership. Returns the caller's userId.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; supabase: SupabaseClient }> {
  const ctx = await getCurrentAccount()
  if (!(await isPlatformAdmin(ctx.userId))) throw new NotPlatformAdminError()
  return { userId: ctx.userId, supabase: ctx.supabase }
}

export function toAdminErrorResponse(err: unknown): NextResponse {
  if (err instanceof NotPlatformAdminError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  return toErrorResponse(err)
}
