-- ============================================================
-- 035_platform_admin.sql
-- Platform admins registry, audit log, workspace profile fields, entitlements/quota RPCs, trial lifecycle, plan-limit triggers, seed plans + trial backfill.
-- Part of the SaaS layer series (031-035). Idempotent.
-- ============================================================

-- 5. PLATFORM ADMINS (super admin — server-side only)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- A user may see only their own admin row (enough for the app to
-- know "am I a platform admin?"). Grants happen via service role.
DROP POLICY IF EXISTS "Users can read own platform admin row" ON platform_admins;
CREATE POLICY "Users can read own platform admin row" ON platform_admins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

ALTER FUNCTION is_platform_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- 6. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  -- Safe metadata only — never secrets, tokens, or card data.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON audit_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Platform admins read the platform-wide log via their own session;
-- account owners read their own account's slice. Inserts are
-- service-role only (or this SECURITY DEFINER helper).
DROP POLICY IF EXISTS "Platform admins can read audit logs" ON audit_logs;
CREATE POLICY "Platform admins can read audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_platform_admin() OR (account_id IS NOT NULL AND is_account_member(account_id, 'owner')));

-- ============================================================
-- 7. ACCOUNT EXTENSIONS (workspace profile)
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'ar'
    CHECK (preferred_language IN ('ar','en'));

-- 7. ACCOUNT EXTENSIONS (workspace profile)
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'ar'
    CHECK (preferred_language IN ('ar','en'));

-- 8. ENTITLEMENTS + QUOTA RPCs
-- ============================================================

-- Effective subscription status, lazily evaluated: a 'trialing' row
-- past trial_ends_at reports as 'expired' without needing a cron.
CREATE OR REPLACE FUNCTION subscription_effective_status(s subscriptions)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < NOW()
      THEN 'expired'
    WHEN s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end < NOW()
      THEN 'expired'
    ELSE s.status
  END;
$$;

-- Full entitlement snapshot for an account: plan limits/features
-- merged with the effective subscription status. One row.
CREATE OR REPLACE FUNCTION get_entitlements(target_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions;
  v_plan plans;
BEGIN
  SELECT * INTO v_sub FROM subscriptions
  WHERE account_id = target_account_id
    AND status IN ('trialing','active','past_due')
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'none',
      'plan_code', NULL,
      'limits', '{}'::jsonb,
      'features', '{}'::jsonb,
      'trial_ends_at', NULL,
      'current_period_end', NULL
    );
  END IF;

  SELECT * INTO v_plan FROM plans WHERE id = v_sub.plan_id;

  RETURN jsonb_build_object(
    'status', subscription_effective_status(v_sub),
    'plan_code', v_plan.code,
    'plan_id', v_plan.id,
    'subscription_id', v_sub.id,
    'limits', COALESCE(v_plan.limits, '{}'::jsonb),
    'features', COALESCE(v_plan.features, '{}'::jsonb),
    'trial_ends_at', v_sub.trial_ends_at,
    'current_period_end', v_sub.current_period_end,
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'billing_cycle', v_sub.billing_cycle
  );
END;
$$;

ALTER FUNCTION get_entitlements(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_entitlements(UUID) TO authenticated, service_role;

-- Atomic monthly usage increment. One round trip, row-level lock
-- inside the upsert — 20 concurrent callers cannot overshoot
-- because the limit check and the increment happen in the same
-- statement. Returns JSONB {allowed, used, limit}.
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  target_account_id UUID,
  target_metric TEXT,
  limit_key TEXT,
  amount BIGINT DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := date_trunc('month', NOW())::date;
  v_end DATE := (date_trunc('month', NOW()) + interval '1 month')::date;
  v_limit BIGINT;
  v_used BIGINT;
  v_ent JSONB;
BEGIN
  v_ent := get_entitlements(target_account_id);
  v_limit := COALESCE((v_ent->'limits'->>limit_key)::bigint, -1);

  INSERT INTO usage_counters (account_id, metric, period_start, period_end, used)
  VALUES (target_account_id, target_metric, v_start, v_end, 0)
  ON CONFLICT (account_id, metric, period_start) DO NOTHING;

  -- Serialize concurrent increments for this bucket.
  SELECT used INTO v_used FROM usage_counters
  WHERE account_id = target_account_id AND metric = target_metric AND period_start = v_start
  FOR UPDATE;

  IF v_limit >= 0 AND v_used + amount > v_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'used', v_used, 'limit', v_limit);
  END IF;

  UPDATE usage_counters
  SET used = used + amount, updated_at = NOW()
  WHERE account_id = target_account_id AND metric = target_metric AND period_start = v_start
  RETURNING used INTO v_used;

  RETURN jsonb_build_object('allowed', TRUE, 'used', v_used, 'limit', v_limit);
END;
$$;

ALTER FUNCTION check_and_increment_usage(UUID, TEXT, TEXT, BIGINT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION check_and_increment_usage(UUID, TEXT, TEXT, BIGINT) TO service_role;

-- Read-only quota check for count-based resources (contacts,
-- automations, …). The caller supplies the current count.
CREATE OR REPLACE FUNCTION check_plan_limit(
  target_account_id UUID,
  limit_key TEXT,
  current_count BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent JSONB := get_entitlements(target_account_id);
  v_limit BIGINT := COALESCE((v_ent->'limits'->>limit_key)::bigint, -1);
BEGIN
  RETURN jsonb_build_object(
    'allowed', v_limit < 0 OR current_count < v_limit,
    'used', current_count,
    'limit', v_limit,
    'status', v_ent->>'status'
  );
END;
$$;

ALTER FUNCTION check_plan_limit(UUID, TEXT, BIGINT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION check_plan_limit(UUID, TEXT, BIGINT) TO authenticated, service_role;

-- 9. TRIAL LIFECYCLE
-- ============================================================

-- Create a trial subscription for an account on the default plan.
-- Idempotent: no-op if a live subscription already exists.
CREATE OR REPLACE FUNCTION create_trial_subscription(target_account_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plans;
  v_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM subscriptions
    WHERE account_id = target_account_id AND status IN ('trialing','active','past_due')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_plan FROM plans
  WHERE is_active ORDER BY is_default DESC, sort_order ASC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL; -- no plans seeded yet; trial created later
  END IF;

  INSERT INTO subscriptions (
    account_id, plan_id, status, billing_cycle, currency,
    trial_started_at, trial_ends_at, current_period_start, current_period_end
  ) VALUES (
    target_account_id, v_plan.id, 'trialing', 'monthly', v_plan.currency,
    NOW(), NOW() + make_interval(days => v_plan.trial_days),
    NOW(), NOW() + make_interval(days => v_plan.trial_days)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION create_trial_subscription(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION create_trial_subscription(UUID) TO authenticated, service_role;

-- Every new account gets a trial automatically (signup path creates
-- the account inside handle_new_user from 017).
CREATE OR REPLACE FUNCTION trial_for_new_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_trial_subscription(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_trial_subscription failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_account_created_trial ON accounts;
CREATE TRIGGER on_account_created_trial
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION trial_for_new_account();

-- Persist lazy transitions — callable from cron (pg_cron / external).
CREATE OR REPLACE FUNCTION refresh_subscription_statuses()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_tmp INTEGER;
BEGIN
  UPDATE subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  UPDATE subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < NOW();
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;

  RETURN v_count;
END;
$$;

ALTER FUNCTION refresh_subscription_statuses() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION refresh_subscription_statuses() TO service_role;

-- 10. PLAN-LIMIT ENFORCEMENT TRIGGERS (defense-in-depth)
--
-- Many rows are inserted straight through the Supabase client, so
-- the DB itself enforces plan caps. The API layer performs the same
-- check first to return friendly bilingual errors; these triggers
-- are the last line of defence and raise SQLSTATE P0001 with a
-- machine-readable message the app maps to an upgrade prompt.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_plan_limit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := TG_ARGV[0];
  v_account UUID;
  v_count BIGINT;
  v_allowed JSONB;
BEGIN
  v_account := NEW.account_id;
  IF v_account IS NULL THEN
    RETURN NEW; -- pre-017 row or trigger on a non-tenant table
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM %I WHERE account_id = $1', TG_TABLE_NAME)
  INTO v_count USING v_account;

  v_allowed := check_plan_limit(v_account, v_key, v_count);
  IF NOT (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:%', v_key USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION enforce_plan_limit_insert() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_limit_contacts ON contacts;
CREATE TRIGGER enforce_limit_contacts BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limit_insert('contacts');

DROP TRIGGER IF EXISTS enforce_limit_automations ON automations;
CREATE TRIGGER enforce_limit_automations BEFORE INSERT ON automations
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limit_insert('automations');

DROP TRIGGER IF EXISTS enforce_limit_api_keys ON api_keys;
CREATE TRIGGER enforce_limit_api_keys BEFORE INSERT ON api_keys
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limit_insert('api_keys');

DROP TRIGGER IF EXISTS enforce_limit_webhook_endpoints ON webhook_endpoints;
CREATE TRIGGER enforce_limit_webhook_endpoints BEFORE INSERT ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limit_insert('webhook_endpoints');

-- 11. SEED PLANS (configurable data, not business logic)
-- ============================================================
INSERT INTO plans (code, name_ar, name_en, description_ar, description_en,
                   price_monthly, price_yearly, currency, trial_days,
                   limits, features, is_active, is_public, is_default, sort_order)
VALUES
  ('STARTER', 'ستارتر', 'Starter',
   'للفرق الصغيرة التي تبدأ رحلتها مع واتساب',
   'For small teams getting started with WhatsApp',
   149, 1490, 'SAR', 14,
   '{"team_members":2,"whatsapp_accounts":1,"contacts":5000,"monthly_messages":10000,"broadcasts_per_month":10,"automations":5,"api_requests_per_month":10000,"webhook_endpoints":2,"ai_requests_per_month":200,"knowledge_documents":10,"api_keys":2}'::jsonb,
   '{"ai_replies":true,"flows":true,"public_api":true}'::jsonb,
   TRUE, TRUE, TRUE, 1),
  ('PRO', 'برو', 'Pro',
   'للشركات النامية التي تحتاج طاقة أكبر',
   'For growing businesses that need more power',
   299, 2990, 'SAR', 14,
   '{"team_members":5,"whatsapp_accounts":2,"contacts":25000,"monthly_messages":50000,"broadcasts_per_month":50,"automations":25,"api_requests_per_month":100000,"webhook_endpoints":10,"ai_requests_per_month":2000,"knowledge_documents":100,"api_keys":10}'::jsonb,
   '{"ai_replies":true,"flows":true,"public_api":true,"priority_support":true}'::jsonb,
   TRUE, TRUE, FALSE, 2),
  ('BUSINESS', 'بيزنس', 'Business',
   'للمؤسسات ذات الأحجام الكبيرة والاحتياجات المتقدمة',
   'For organizations with high volume and advanced needs',
   599, 5990, 'SAR', 14,
   '{"team_members":-1,"whatsapp_accounts":5,"contacts":-1,"monthly_messages":-1,"broadcasts_per_month":-1,"automations":-1,"api_requests_per_month":-1,"webhook_endpoints":-1,"ai_requests_per_month":10000,"knowledge_documents":-1,"api_keys":-1}'::jsonb,
   '{"ai_replies":true,"flows":true,"public_api":true,"priority_support":true,"sla":true}'::jsonb,
   TRUE, TRUE, FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- Backfill: existing accounts (created before this migration) get a
-- trial on the default plan unless they already have a live sub.
DO $$
DECLARE
  v_account RECORD;
BEGIN
  FOR v_account IN SELECT id FROM accounts LOOP
    PERFORM create_trial_subscription(v_account.id);
  END LOOP;
END $$;
