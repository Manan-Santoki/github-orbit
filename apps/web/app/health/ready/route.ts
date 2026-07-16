import { NextResponse } from "next/server";
import { connectedConfigIssues, getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { getRedisConnection } from "@github-orbit/queues";

export async function GET() {
  if (getConfig().DEMO_MODE) return NextResponse.json({ status: "ready", mode: "demo" });
  try {
    const issues = connectedConfigIssues();
    if (issues.length) return NextResponse.json({ status: "not_ready", issues }, { status: 503 });
    await Promise.all([getPool().query("SELECT 1"), getRedisConnection().ping()]);
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503 });
  }
}
