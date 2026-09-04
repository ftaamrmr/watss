import { NextResponse } from "next/server"
import { requireRole, toErrorResponse } from "@/lib/auth/account"
import { getEntitlements } from "@/lib/entitlements"
import { audit } from "@/lib/audit"

const TIMEZONE_RE = /^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/

// GET /api/account/onboarding — current onboarding state.
export async function GET() {
  try {
    const ctx = await requireRole("viewer")
    const [accountRes, waRes, membersRes] = await Promise.all([
      ctx.supabase
        .from("accounts")
        .select("id, name, country, timezone, preferred_language, created_at")
        .eq("id", ctx.accountId)
        .single(),
      ctx.supabase
        .from("whatsapp_config")
        .select("status")
        .eq("account_id", ctx.accountId)
        .maybeSingle(),
      ctx.supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("account_id", ctx.accountId),
    ])
    if (accountRes.error) throw accountRes.error

    const entitlements = await getEntitlements(ctx.accountId)
    return NextResponse.json({
      account: accountRes.data,
      whatsapp_status: waRes.data?.status ?? "disconnected",
      member_count: membersRes.count ?? 1,
      entitlements,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// POST /api/account/onboarding — set workspace profile fields.
// Owner only: this defines the company identity.
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner")
    const body = await request.json().catch(() => ({}))

    const patch: Record<string, unknown> = {}
    if (typeof body?.name === "string" && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 120)
    }
    if (typeof body?.country === "string") patch.country = body.country.trim().slice(0, 80)
    if (typeof body?.timezone === "string" && TIMEZONE_RE.test(body.timezone)) {
      patch.timezone = body.timezone
    }
    if (body?.preferred_language === "ar" || body?.preferred_language === "en") {
      patch.preferred_language = body.preferred_language
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields supplied" }, { status: 400 })
    }

    const { error } = await ctx.supabase
      .from("accounts")
      .update(patch)
      .eq("id", ctx.accountId)
    if (error) throw error

    await audit({
      actorUserId: ctx.userId,
      action: "account.onboarding_updated",
      targetType: "account",
      targetId: ctx.accountId,
      accountId: ctx.accountId,
      metadata: { fields: Object.keys(patch) },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
