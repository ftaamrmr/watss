import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Shared lazy service-role client for the billing/SaaS layer.
// Mirrors src/lib/ai/admin-client.ts — kept separate so the SaaS
// modules have one obvious import. NEVER expose this client to the
// browser; it bypasses RLS.
let _client: SupabaseClient | null = null

export function billingAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _client
}
