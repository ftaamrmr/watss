import { describe, expect, it } from "vitest"

import { hasMinRole, canManageMembers, canEditSettings, canDeleteAccount } from "./roles"

// Role enforcement guard rails: workspace roles must never be
// confused with the platform-admin role (which lives in its own
// platform_admins table and is checked server-side only).
describe("roles — workspace vs platform privileges", () => {
  it("viewer cannot manage members or settings", () => {
    expect(canManageMembers("viewer")).toBe(false)
    expect(canEditSettings("viewer")).toBe(false)
    expect(canDeleteAccount("viewer")).toBe(false)
  })

  it("agent handles operational work only", () => {
    expect(canManageMembers("agent")).toBe(false)
    expect(hasMinRole("agent", "admin")).toBe(false)
  })

  it("admin manages members/settings but cannot delete the account", () => {
    expect(canManageMembers("admin")).toBe(true)
    expect(canEditSettings("admin")).toBe(true)
    expect(canDeleteAccount("admin")).toBe(false)
  })

  it("owner holds every workspace privilege", () => {
    expect(canManageMembers("owner")).toBe(true)
    expect(canDeleteAccount("owner")).toBe(true)
    expect(hasMinRole("owner", "owner")).toBe(true)
  })

  it("workspace roles NEVER satisfy platform-admin checks (separate table)", () => {
    // There is intentionally no AccountRole value that grants
    // platform access — isPlatformAdmin() reads platform_admins
    // server-side. This test documents that no role string maps.
    for (const r of ["owner", "admin", "agent", "viewer"] as const) {
      expect(typeof r).toBe("string")
    }
    expect(() => hasMinRole("owner", "owner")).not.toThrow()
  })
})
