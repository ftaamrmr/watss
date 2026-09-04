import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

import { resolveAppUrl } from "./branding"

describe("branding.resolveAppUrl — never leaks to external domains", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.APP_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    process.env.APP_URL = env.APP_URL
    process.env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_SITE_URL = env.NEXT_PUBLIC_SITE_URL
    vi.unstubAllEnvs()
  })

  it("prefers the explicit APP_URL and strips trailing slashes", () => {
    process.env.APP_URL = "https://app.example.com/"
    expect(resolveAppUrl()).toBe("https://app.example.com")
  })

  it("falls back to the request's own host, never a hardcoded domain", () => {
    const req = new Request("https://tenant.example.sa/api/x", {
      headers: { "x-forwarded-host": "app.watss.sa", "x-forwarded-proto": "https" },
    })
    const url = resolveAppUrl(req)
    expect(url).toBe("https://app.watss.sa")
    expect(url).not.toContain("wacrm.tech")
  })

  it("throws in production when nothing is configured and no request exists", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(() => resolveAppUrl()).toThrow(/APP_URL/)
  })

  it("returns localhost only outside production", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(resolveAppUrl()).toBe("http://localhost:3000")
  })
})
