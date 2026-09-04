-- ============================================================
-- 032_subscriptions.sql
-- Subscriptions per account (tenant), statuses, one live sub per account.
-- Part of the SaaS layer series (031-035). Idempotent.
-- ============================================================

-- 2. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','cancelled','expired','suspended')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','yearly')),
  currency TEXT NOT NULL DEFAULT 'SAR',
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  -- Payment provider linkage (Moyasar / MyFatoorah / …). All NULL
  -- until a real provider is configured.
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end
  ON subscriptions(trial_ends_at) WHERE status = 'trialing';

-- One *effective* subscription per account. Historical rows
-- (cancelled/expired) may accumulate; live ones may not.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_live_per_account
  ON subscriptions(account_id)
  WHERE status IN ('trialing','active','past_due');

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Members may read their account's subscription (the billing UI is
-- role-gated in the app layer). Writes go through the service role.
DROP POLICY IF EXISTS "Members can read own subscription" ON subscriptions;
CREATE POLICY "Members can read own subscription" ON subscriptions
  FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'viewer'));

