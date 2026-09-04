import { NextResponse } from "next/server"

// GET /api/health — liveness only. Deliberately reveals nothing about
// the environment, versions, or infrastructure.
export async function GET() {
  return NextResponse.json({ status: "ok" })
}
