import { describe, expect, it } from "vitest"

import {
  canUseFeature,
  canWrite,
  getLimitValue,
  isUnlimited,
  quotaAllows,
  trialDaysRemaining,
  PlanLimitError,
  SubscriptionInactiveError,
} from "./index"
import type { Entitlements } from "@/lib/billing/types"

const base: Entitlements = {
  status: "active",
  plan_code: "PRO",
  limits: { contacts: 5000, monthly_messages: 10000, team_members: -1 },
  features: { ai_replies: true },
  trial_ends_at: null,
  current_period_end: null,
}

describe("entitlements — pure decision logic", () => {
  it("treats -1 and missing limits as unlimited", () => {
    expect(isUnlimited(-1)).toBe(true)
    expect(isUnlimited(undefined)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(getLimitValue(base, "team_members")).toBe(-1)
    expect(getLimitValue(base, "contacts")).toBe(5000)
    expect(getLimitValue(base, "automations")).toBe(-1)
  })

  it("quotaAllows respects the cap and the increment amount", () => {
    expect(quotaAllows(0, 2)).toBe(true)
    expect(quotaAllows(1, 2)).toBe(true)
    expect(quotaAllows(2, 2)).toBe(false)
    expect(quotaAllows(1, 2, 2)).toBe(false)
    expect(quotaAllows(999_999, -1)).toBe(true)
  })

  it("feature flags default to false and never branch on plan names", () => {
    expect(canUseFeature(base, "ai_replies")).toBe(true)
    expect(canUseFeature(base, "sla")).toBe(false)
  })

  it("writes allowed while trialing/active/past_due, blocked otherwise", () => {
    for (const s of ["trialing", "active", "past_due"] as const) {
      expect(canWrite({ ...base, status: s })).toBe(true)
    }
    for (const s of ["cancelled", "expired", "suspended", "none"] as const) {
      expect(canWrite({ ...base, status: s })).toBe(false)
    }
  })

  it("trialDaysRemaining counts whole days and floors at 0", () => {
    const ent: Entitlements = {
      ...base,
      status: "trialing",
      trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    }
    expect(trialDaysRemaining(ent)).toBe(5)
    expect(
      trialDaysRemaining({ ...ent, trial_ends_at: new Date(Date.now() - 1000).toISOString() }),
    ).toBe(0)
    expect(trialDaysRemaining({ ...ent, status: "active" })).toBe(0)
  })

  it("errors carry machine-readable codes + structured fields", () => {
    const q = new PlanLimitError("contacts", 5000, 5000)
    expect(q.code).toBe("PLAN_LIMIT_EXCEEDED")
    expect(q.resource).toBe("contacts")
    const s = new SubscriptionInactiveError("expired")
    expect(s.code).toBe("SUBSCRIPTION_INACTIVE")
    expect(s.status).toBe("expired")
  })
})
