import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/ready
 *
 * Readiness probe used by container orchestrators (Docker, Coolify, K8s).
 * Returns 200 only when the application is ready to serve traffic —
 * i.e. the Next.js process is alive AND the Supabase database is reachable.
 *
 * Returns 503 when the DB is unreachable so the orchestrator can hold
 * traffic until the service is actually ready (e.g. during startup or
 * after a DB failover).
 *
 * Unlike /api/health, this endpoint is NOT suitable as a liveness probe
 * because a transient DB blip would kill the container. Use it only as
 * a startup probe or readiness probe.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json(
      {
        status: 'error',
        reason: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }

  try {
    const db = createClient(url, key)
    // Lightweight ping — selects a single row from a small, always-present
    // table. `maybeSingle()` prevents a 406 when the table is empty.
    const { error } = await db
      .from('accounts')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        {
          status: 'error',
          reason: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        reason: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
