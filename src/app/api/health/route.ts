import { NextResponse } from 'next/server'

/**
 * GET /api/health
 *
 * Liveness probe used by container orchestrators (Docker, Coolify, K8s).
 * Returns 200 as long as the Next.js process is alive.
 *
 * This endpoint intentionally does NOT check Supabase connectivity —
 * that would make the liveness probe unhealthy whenever the DB is slow,
 * potentially causing premature container restarts. Use /api/ready for
 * readiness / deep-health checks that include DB connectivity.
 */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}
