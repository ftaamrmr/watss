-- ============================================================
-- 033_usage_quotas.sql
-- Monthly usage counters + atomic quota RPCs + limit enforcement triggers.
-- Part of the SaaS layer series (031-035). Idempotent.
-- ============================================================

-- 3. USAGE COUNTERS
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used BIGINT NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_account_period
  ON usage_counters(account_id, period_start);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own usage" ON usage_counters;
CREATE POLICY "Members can read own usage" ON usage_counters
  FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'viewer'));

