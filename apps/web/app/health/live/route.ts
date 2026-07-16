import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "web", time: new Date().toISOString() });
}
