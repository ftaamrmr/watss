import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "wacrm",
    timestamp: new Date().toISOString(),
  });
}
