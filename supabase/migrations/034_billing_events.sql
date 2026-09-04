-- ============================================================
-- 034_billing_events.sql
-- Provider webhook journal — idempotent event processing (UNIQUE provider+event_id).
-- Part of the SaaS layer series (031-035). Idempotent.
-- ============================================================

-- 4. BILLING EVENTS (provider webhook journal)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  -- Never store card data — only the provider payload needed for
  -- reconciliation, hashed for tamper evidence.
  payload_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed','duplicate','failed','ignored')),
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_account ON billing_events(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_status ON billing_events(status);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own billing events" ON billing_events;
CREATE POLICY "Owners can read own billing events" ON billing_events
  FOR SELECT TO authenticated
  USING (account_id IS NOT NULL AND is_account_member(account_id, 'admin'));

