import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertConnectedConfig, getConfig } from "@github-orbit/config";
import { randomToken, tokenHash } from "@github-orbit/core/crypto";
import { buildGitHubAuthorizeUrl } from "@github-orbit/integrations/github";
import { getRedisConnection } from "@github-orbit/queues";
import { getViewer, safeReturnTo } from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const config = getConfig();
  if (config.DEMO_MODE) return NextResponse.redirect(new URL("/explore", request.url));
  assertConnectedConfig();
  const intent = request.nextUrl.searchParams.get("intent") === "follow" ? "follow" : "signin";
  const viewer = await getViewer();
  if (intent === "follow" && !viewer) return NextResponse.redirect(new URL("/", request.url));

  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  await getRedisConnection().set(
    `oauth:${tokenHash(state)}`,
    JSON.stringify({ intent, verifier, returnTo, accountId: viewer?.accountId }),
    "EX",
    600,
  );
  const response = NextResponse.redirect(
    buildGitHubAuthorizeUrl({ intent, state, codeChallenge: challenge }),
  );
  response.cookies.set("orbit_oauth_state", tokenHash(state), {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/auth/github/callback",
  });
  return response;
}
