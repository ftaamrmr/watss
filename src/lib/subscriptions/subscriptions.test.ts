import { describe, expect, it } from "vitest"

import { nextStatus } from "./index"

// Subscription status machine — the transitions every billing path
// (trial expiry, webhook, cancel, suspend) must obey.
describe("subscriptions — status transitions", () => {
  it("trial lifecycle: trialing → active on payment, → expired on timeout", () => {
    expect(nextStatus("trialing", "payment_succeeded")).toBe("active")
    expect(nextStatus("trialing", "expire")).toBe("expired")
  })

  it("active → past_due on failed renewal, past_due → active on recovery", () => {
    expect(nextStatus("active", "payment_failed")).toBe("past_due")
    expect(nextStatus("past_due", "payment_succeeded")).toBe("active")
    expect(nextStatus("past_due", "suspend")).toBe("suspended")
  })

  it("cancellation works from any live status", () => {
    for (const s of ["trialing", "active", "past_due"] as const) {
      expect(nextStatus(s, "cancel")).toBe("cancelled")
    }
  })

  it("suspend/unsuspend round-trips through active", () => {
    expect(nextStatus("active", "suspend")).toBe("suspended")
    expect(nextStatus("suspended", "unsuspend")).toBe("active")
  })

  it("dead states accept no further transitions", () => {
    for (const s of ["cancelled", "expired"] as const) {
      for (const a of ["payment_succeeded", "cancel", "suspend", "unsuspend"] as const) {
        expect(nextStatus(s, a), `${s} + ${a}`).toBeNull()
      }
    }
  })

  it("no illegal jumps (e.g. expired never becomes active directly)", () => {
    expect(nextStatus("expired", "payment_succeeded")).toBeNull()
    expect(nextStatus("suspended", "payment_succeeded")).toBeNull()
  })
})
