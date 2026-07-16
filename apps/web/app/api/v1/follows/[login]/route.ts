import { NextRequest } from "next/server";
import { getConfig } from "@github-orbit/config";
import { decryptSecret } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { GitHubClient } from "@github-orbit/integrations/github";
import { requireViewer } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../lib/http";

async function mutate(request: NextRequest, login: string, action: "follow" | "unfollow") {
  assertSameOrigin(request);
  const viewer = await requireViewer();
  const config = getConfig();
  if (config.DEMO_MODE) return noStoreJson({ ok: true, demo: true, action });
  const credential = await getPool().query<{ follow_token_encrypted: string | null }>(
    "SELECT follow_token_encrypted FROM github_oauth_credentials WHERE account_id=$1",
    [viewer.accountId],
  );
  const encrypted = credential.rows[0]?.follow_token_encrypted;
  if (!encrypted || !config.TOKEN_ENCRYPTION_KEY) {
    return noStoreJson(
      {
        code: "FOLLOW_PERMISSION_REQUIRED",
        authorizeUrl: `/auth/github/start?intent=follow&returnTo=${encodeURIComponent(`/for-you?follow=${login}`)}`,
      },
      { status: 428 },
    );
  }
  const client = new GitHubClient(decryptSecret(encrypted, config.TOKEN_ENCRYPTION_KEY));
  if (action === "follow") await client.follow(login);
  else await client.unfollow(login);
  await getPool().query(`INSERT INTO audit_events (account_id,action,subject) VALUES ($1,$2,$3)`, [
    viewer.accountId,
    `github.${action}`,
    login,
  ]);
  return noStoreJson({ ok: true, action });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ login: string }> }) {
  try {
    return await mutate(request, (await context.params).login, "follow");
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ login: string }> },
) {
  try {
    return await mutate(request, (await context.params).login, "unfollow");
  } catch (error) {
    return apiError(error);
  }
}
