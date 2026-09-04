import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// Static tenant-isolation guard: every tenant-owned table must have an
// account_id column AND RLS enabled AND a membership-checked policy in
// the migration series. This catches "added a table, forgot the RLS"
// before it ships. Runtime cross-tenant behaviour itself is exercised
// against a live database in the integration suite (see the final
// report); this test is the always-on CI tripwire.
const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations")
const sql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n")

const TENANT_TABLES = [
  "contacts",
  "conversations",
  "whatsapp_config",
  "message_templates",
  "pipelines",
  "deals",
  "broadcasts",
  "automations",
  "flows",
  "api_keys",
  "webhook_endpoints",
]

describe("tenant isolation — migration audit", () => {
  for (const table of TENANT_TABLES) {
    it(`${table}: has account_id + RLS + membership policy`, () => {
      // account_id arrives either via ALTER TABLE ... ADD COLUMN on a
      // pre-existing table, or inline in CREATE TABLE for tables that were
      // born multi-tenant (e.g. api_keys, webhook_endpoints).
      const hasAccountId = new RegExp(
        `(ALTER TABLE ${table}[^;]*account_id)|(CREATE TABLE[^;]*\\b${table}\\b[^;]*account_id)`,
        "s",
      )
      expect(hasAccountId.test(sql)).toBe(true)
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
      // At least one policy mentions membership for this table.
      const policyBlock = new RegExp(
        `POLICY[^;]*ON ${table}[^;]*is_account_member`,
        "s",
      )
      expect(policyBlock.test(sql)).toBe(true)
    })
  }

  it("SaaS tables have RLS enabled", () => {
    for (const t of ["plans", "subscriptions", "usage_counters", "billing_events", "platform_admins", "audit_logs"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`))
    }
  })

  it("quota RPC is atomic (single UPDATE with lock)", () => {
    expect(sql).toContain("check_and_increment_usage")
    expect(sql).toContain("FOR UPDATE")
  })

  it("one live subscription per account (partial unique index)", () => {
    expect(sql).toContain("idx_subscriptions_one_live_per_account")
  })

  it("billing webhooks are idempotent (UNIQUE provider+event)", () => {
    expect(sql).toMatch(/UNIQUE \(provider, event_id\)/)
  })
})
