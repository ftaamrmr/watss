import { describe, expect, it } from "vitest"

import { getPaymentProvider, PaymentProviderUnavailable } from "./provider"
import { hashPayload } from "./events"

describe("payment provider — fail closed without credentials", () => {
  it("resolves to the disabled provider when unset or unknown", () => {
    expect(getPaymentProvider("").code).toBe("disabled")
    expect(getPaymentProvider("moyasar").code).toBe("disabled") // not registered yet
    expect(getPaymentProvider(undefined).code).toBe("disabled")
  })

  it("never fakes success: every mutating call throws", async () => {
    const p = getPaymentProvider()
    expect(p.isConfigured()).toBe(false)
    await expect(p.createCheckout({} as never)).rejects.toBeInstanceOf(
      PaymentProviderUnavailable,
    )
    await expect(p.verifyWebhook("{}", new Headers())).rejects.toBeInstanceOf(
      PaymentProviderUnavailable,
    )
    await expect(p.cancelSubscription("x")).rejects.toBeInstanceOf(
      PaymentProviderUnavailable,
    )
  })
})

describe("billing events — payload hashing", () => {
  it("produces stable sha256 hex hashes", () => {
    const h1 = hashPayload({ a: 1 })
    const h2 = hashPayload({ a: 1 })
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPayload({ a: 2 })).not.toBe(h1)
  })
})
