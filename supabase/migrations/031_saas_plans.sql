-- ============================================================
-- 031_saas_plans.sql
-- Plans catalog (bilingual, DB-driven limits/features).
-- Part of the SaaS layer series (031-035). Idempotent.
-- ============================================================

-- 1. PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  price_monthly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
  price_yearly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_yearly >= 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  trial_days INTEGER NOT NULL DEFAULT 14 CHECK (trial_days >= 0),
  -- Resource caps. -1 = unlimited. Known keys:
  --   team_members, whatsapp_accounts, contacts, monthly_messages,
  --   broadcasts_per_month, automations, api_requests_per_month,
  --   webhook_endpoints, ai_requests_per_month, knowledge_documents
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Boolean/feature flags, e.g. {"ai_replies": true, "flows": true}.
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Any signed-in user may read public, active plans (pricing page and
-- upgrade UI). Plan management happens via the service role only.
DROP POLICY IF EXISTS "Authenticated users can read public plans" ON plans;
CREATE POLICY "Authenticated users can read public plans" ON plans
  FOR SELECT TO authenticated
  USING (is_active AND is_public);

-- At most one default plan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_single_default
  ON plans(is_default) WHERE is_default;

