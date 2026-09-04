// ============================================================
// Payment provider abstraction.
//
// Business logic talks ONLY to this interface — never to Moyasar /
// MyFatoorah SDKs directly. Providers are registered by code and
// resolved from PAYMENT_PROVIDER env. Without credentials the active
// provider is `disabled`: checkout/subscription mutations fail
// closed with PaymentProviderUnavailable, and webhooks are rejected.
//
// Adding Moyasar later = implement this interface in
// providers/moyasar.ts, register it, set env vars. No call-site
// changes.
// ============================================================

export interface CheckoutParams {
  accountId: string
  planId: string
  billingCycle: "monthly" | "yearly"
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  metadata?: Record<string, string>
}

export interface CheckoutResult {
  /** Provider-hosted checkout URL the customer is redirected to. */
  checkoutUrl: string
  providerSessionId: string
}

export interface VerifiedWebhook {
  /** Provider-unique event id (idempotency key). */
  eventId: string
  eventType: string
  accountId: string | null
  providerSubscriptionId: string | null
  providerCustomerId: string | null
  status: string | null
  /** Raw, already-verified payload for reconciliation. */
  payload: Record<string, unknown>
}

export interface PaymentProvider {
  readonly code: string
  /** True only when real credentials are configured. */
  isConfigured(): boolean
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
  getSubscription(providerSubscriptionId: string): Promise<{ status: string }>
  createCustomer(email: string, name: string): Promise<{ customerId: string }>
  /**
   * Verify an inbound webhook's signature and normalize it. MUST
   * throw on invalid signatures — a `success redirect` is never
   * proof of payment; only a verified webhook mutates subscriptions.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhook>
}

export class PaymentProviderUnavailable extends Error {
  readonly code = "PAYMENT_PROVIDER_UNAVAILABLE"
  constructor(provider: string) {
    super(`Payment provider '${provider}' is not configured`)
    this.name = "PaymentProviderUnavailable"
  }
}

// ------------------------------------------------------------
// Disabled provider — the default until real credentials exist.
// ------------------------------------------------------------
class DisabledPaymentProvider implements PaymentProvider {
  readonly code = "disabled"
  isConfigured() {
    return false
  }
  async createCheckout(): Promise<CheckoutResult> {
    throw new PaymentProviderUnavailable(this.code)
  }
  async cancelSubscription(): Promise<void> {
    throw new PaymentProviderUnavailable(this.code)
  }
  async getSubscription(): Promise<{ status: string }> {
    throw new PaymentProviderUnavailable(this.code)
  }
  async createCustomer(): Promise<{ customerId: string }> {
    throw new PaymentProviderUnavailable(this.code)
  }
  async verifyWebhook(): Promise<VerifiedWebhook> {
    throw new PaymentProviderUnavailable(this.code)
  }
}

const registry = new Map<string, () => PaymentProvider>()

export function registerPaymentProvider(code: string, factory: () => PaymentProvider) {
  registry.set(code, factory)
}

/**
 * Resolve the active provider from PAYMENT_PROVIDER. Unknown or
 * unset codes resolve to the disabled provider — fail closed, never
 * fake-success.
 */
export function getPaymentProvider(code = process.env.PAYMENT_PROVIDER ?? ""): PaymentProvider {
  const factory = registry.get(code)
  if (!factory) return new DisabledPaymentProvider()
  const provider = factory()
  return provider.isConfigured() ? provider : new DisabledPaymentProvider()
}
