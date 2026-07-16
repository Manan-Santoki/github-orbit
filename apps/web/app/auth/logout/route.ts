import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@github-orbit/config";
import { tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { assertSameOrigin } from "../../../lib/http";

export async function POST(request: NextRequest) {
  assertSameOrigin(request);
  const config = getConfig();
  const token = request.cookies.get(config.SESSION_COOKIE_NAME)?.value;
  if (token && !config.DEMO_MODE)
    await getPool().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(config.SESSION_COOKIE_NAME);
  return response;
}
