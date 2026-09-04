-- 036_ai_knowledge_rpc_tenant_guard.sql
--
-- SECURITY FIX — cross-tenant knowledge-base leak.
--
-- match_ai_knowledge_fts / match_ai_knowledge_semantic (migration 030)
-- are SECURITY DEFINER with EXECUTE granted to `authenticated`, but
-- trust the caller-supplied p_account_id. Any logged-in user could
-- therefore read another tenant's knowledge chunks by passing that
-- tenant's account_id (RLS is bypassed by SECURITY DEFINER).
--
-- Fix: re-create both functions with an explicit caller check —
-- browser callers (auth.uid() IS NOT NULL) must be members of the
-- tenant they query; the service role (no JWT sub) keeps full access
-- for the auto-reply bot.

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id  uuid,
  p_query       text,
  p_match_count integer
)
RETURNS TABLE (id uuid, content text, rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    -- Tenant guard: interactive callers may only query their own
    -- account. Service role (auth.uid() IS NULL) is exempt — it is
    -- already trusted server-side and resolves the tenant from
    -- webhook/bot context, not from user input.
    AND (auth.uid() IS NULL OR is_account_member(p_account_id))
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id      uuid,
  p_query_embedding text,
  p_match_count     integer
)
RETURNS TABLE (id uuid, content text, distance real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id,
         c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (auth.uid() IS NULL OR is_account_member(p_account_id))
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$;

-- Grants unchanged: re-assert so REVOKE/GRANT posture stays explicit.
REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) TO authenticated, service_role;

ALTER FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) OWNER TO postgres;
ALTER FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) OWNER TO postgres;

-- ============================================================
-- Same class of bug in the 035 SaaS RPCs: SECURITY DEFINER +
-- EXECUTE granted to `authenticated`, trusting the caller-supplied
-- account_id. Guard them the same way: interactive callers must be
-- members of the target account; service role stays exempt.
-- ============================================================

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
  IF auth.uid() IS NOT NULL AND NOT is_account_member(target_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;

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
  v_ent JSONB;
  v_limit BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_account_member(target_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;

  v_ent := get_entitlements(target_account_id);
  v_limit := COALESCE((v_ent->'limits'->>limit_key)::bigint, -1);

  RETURN jsonb_build_object(
    'allowed', v_limit < 0 OR current_count < v_limit,
    'limit', v_limit,
    'current', current_count
  );
END;
$$;

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
  IF auth.uid() IS NOT NULL AND NOT is_account_member(target_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;

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
    NOW(), NOW() + (v_plan.trial_days || ' days')::interval,
    NOW(), NOW() + interval '1 month'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION get_entitlements(UUID) OWNER TO postgres;
ALTER FUNCTION check_plan_limit(UUID, TEXT, BIGINT) OWNER TO postgres;
ALTER FUNCTION create_trial_subscription(UUID) OWNER TO postgres;
