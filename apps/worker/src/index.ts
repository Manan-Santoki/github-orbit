import { writeFile } from "node:fs/promises";
import { Worker, type Job } from "bullmq";
import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { assertConnectedConfig, getConfig } from "@github-orbit/config";
import { decryptSecret } from "@github-orbit/core/crypto";
import {
  RANKER_VERSION,
  explanationReasons,
  jaccard,
  scoreCandidate,
  type RankingFeatures,
} from "@github-orbit/core/ranking";
import {
  accounts,
  auditEvents,
  closeDb,
  followEdges,
  getDb,
  getPool,
  githubFetchState,
  githubUsers,
  oauthCredentials,
  recommendations,
  repositories,
  syncRuns,
  userFeatures,
} from "@github-orbit/db";
import {
  GitHubApiError,
  GitHubClient,
  OpenRouterClient,
  buildProfileText,
  profileTextHash,
  PROFILE_TEXT_VERSION,
  type GitHubListUser,
  type GitHubProfile,
  type GitHubRepository,
} from "@github-orbit/integrations";
import {
  QUEUE_NAME,
  addOrbitJob,
  closeQueues,
  getRedisConnection,
  type OrbitJob,
} from "@github-orbit/queues";
import { coverageIsComplete, nextPageForLoaded } from "./pagination";

const config = getConfig();
if (!config.DEMO_MODE) assertConnectedConfig();
const db = getDb();
const pool = getPool();
const heartbeat = "/tmp/orbit-worker-health";

async function touchHeartbeat(): Promise<void> {
  await writeFile(heartbeat, String(Date.now()));
}

setInterval(() => void touchHeartbeat(), 30_000).unref();
await touchHeartbeat();

async function credentialsFor(accountId: string, follow = false): Promise<string> {
  const [credential] = await db
    .select()
    .from(oauthCredentials)
    .where(eq(oauthCredentials.accountId, accountId))
    .limit(1);
  if (!credential) throw new Error("GitHub credentials not found");
  const encrypted = follow ? credential.followTokenEncrypted : credential.readTokenEncrypted;
  if (!encrypted)
    throw new Error(follow ? "GitHub follow permission is required" : "GitHub token missing");
  if (!config.TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return decryptSecret(encrypted, config.TOKEN_ENCRYPTION_KEY);
}

function isBot(profile: { login: string; type: string }): boolean {
  return (
    profile.type === "Bot" || profile.login.endsWith("[bot]") || profile.login.endsWith("-bot")
  );
}

async function upsertProfile(profile: GitHubProfile | GitHubListUser): Promise<string> {
  const detailed = "followers" in profile;
  const [row] = await db
    .insert(githubUsers)
    .values({
      githubId: BigInt(profile.id),
      nodeId: profile.node_id,
      login: profile.login,
      name: detailed ? profile.name : null,
      bio: detailed ? profile.bio : null,
      company: detailed ? profile.company : null,
      location: detailed ? profile.location : null,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url,
      accountType: profile.type,
      isBot: isBot(profile),
      followersCount: detailed ? profile.followers : 0,
      followingCount: detailed ? profile.following : 0,
      publicReposCount: detailed ? profile.public_repos : 0,
      profileUpdatedAt: detailed ? new Date(profile.updated_at) : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: githubUsers.githubId,
      set: {
        login: profile.login,
        nodeId: profile.node_id,
        avatarUrl: profile.avatar_url,
        htmlUrl: profile.html_url,
        accountType: profile.type,
        isBot: isBot(profile),
        ...(detailed
          ? {
              name: profile.name,
              bio: profile.bio,
              company: profile.company,
              location: profile.location,
              followersCount: profile.followers,
              followingCount: profile.following,
              publicReposCount: profile.public_repos,
              profileUpdatedAt: new Date(profile.updated_at),
            }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: githubUsers.id });
  if (!row) throw new Error(`Unable to upsert ${profile.login}`);
  return row.id;
}

async function storeRepositories(ownerId: string, items: GitHubRepository[]): Promise<void> {
  const selected = items.filter((item) => !item.fork).slice(0, 10);
  for (const repository of selected) {
    await db
      .insert(repositories)
      .values({
        githubId: BigInt(repository.id),
        ownerUserId: ownerId,
        name: repository.name,
        description: repository.description,
        htmlUrl: repository.html_url,
        isFork: repository.fork,
        stars: repository.stargazers_count,
        topics: repository.topics ?? [],
        languages: repository.language ? { [repository.language]: 1 } : {},
        pushedAt: repository.pushed_at ? new Date(repository.pushed_at) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: repositories.githubId,
        set: {
          name: repository.name,
          description: repository.description,
          htmlUrl: repository.html_url,
          stars: repository.stargazers_count,
          topics: repository.topics ?? [],
          languages: repository.language ? { [repository.language]: 1 } : {},
          pushedAt: repository.pushed_at ? new Date(repository.pushed_at) : null,
          updatedAt: new Date(),
        },
      });
  }
  const latestActivity = selected
    .map((repository) => repository.pushed_at)
    .filter((value): value is string => !!value)
    .map((value) => new Date(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (latestActivity) {
    await db
      .update(githubUsers)
      .set({ activityAt: latestActivity })
      .where(eq(githubUsers.id, ownerId));
  }
}

async function enrichCandidateProfiles(
  client: GitHubClient,
  rootId: string,
  limit = 20,
): Promise<number> {
  const candidates = await pool.query<{ id: string; login: string }>(
    `SELECT gu.id,gu.login
     FROM follow_edges incoming
     JOIN github_users gu ON gu.id=incoming.source_user_id
     WHERE incoming.target_user_id=$1
       AND gu.profile_updated_at IS NULL
       AND gu.unavailable_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM follow_edges outgoing
         WHERE outgoing.source_user_id=$1 AND outgoing.target_user_id=gu.id
       )
     ORDER BY gu.login
     LIMIT $2`,
    [rootId, limit],
  );
  let enriched = 0;
  for (const candidate of candidates.rows) {
    try {
      const profile = await client.getUser(candidate.login);
      const candidateId = await upsertProfile(profile.data);
      const repos = await client.listRepositories(candidate.login);
      await storeRepositories(candidateId, repos.data);
      enriched += 1;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        await db
          .update(githubUsers)
          .set({ unavailableAt: new Date() })
          .where(eq(githubUsers.id, candidate.id));
        continue;
      }
      throw error;
    }
  }
  return enriched;
}

async function storeRelationship(source: string, target: string): Promise<void> {
  if (source === target) return;
  await db
    .insert(followEdges)
    .values({ sourceUserId: source, targetUserId: target, lastObservedAt: new Date() })
    .onConflictDoUpdate({
      target: [followEdges.sourceUserId, followEdges.targetUserId],
      set: { lastObservedAt: new Date() },
    });
}

async function markSync(
  id: string,
  update: Partial<{
    status: "queued" | "running" | "waiting_rate_limit" | "completed" | "failed";
    stage: string;
    progress: Record<string, unknown>;
    errorCode: string | null;
    errorMessage: string | null;
    rateLimitResetAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }>,
): Promise<void> {
  await db.update(syncRuns).set(update).where(eq(syncRuns.id, id));
}

async function syncDirection(input: {
  client: GitHubClient;
  login: string;
  rootId: string;
  direction: "followers" | "following";
  pageCap: number;
  syncRunId: string;
  startPage?: number;
  previouslyLoaded?: number;
  totalCount?: number;
}): Promise<{ loaded: number; added: number; complete: boolean }> {
  let loaded = input.previouslyLoaded ?? 0;
  let added = 0;
  let complete = false;
  const startPage = input.startPage ?? 1;
  const endPage = startPage + input.pageCap - 1;
  for (let page = startPage; page <= endPage; page += 1) {
    const response =
      input.direction === "followers"
        ? await input.client.listFollowers(input.login, page)
        : await input.client.listFollowing(input.login, page);
    for (const person of response.data) {
      const personId = await upsertProfile(person);
      if (input.direction === "followers") await storeRelationship(personId, input.rootId);
      else await storeRelationship(input.rootId, personId);
    }
    loaded += response.data.length;
    added += response.data.length;
    await markSync(input.syncRunId, {
      stage: `loading_${input.direction}`,
      progress: { direction: input.direction, loaded, page },
    });
    if (coverageIsComplete(response.data.length, loaded, input.totalCount)) {
      complete = true;
      break;
    }
  }
  await db
    .insert(githubFetchState)
    .values({
      resourceKey: `users/${input.login}/${input.direction}`,
      complete,
      truncated: !complete,
      loadedCount: loaded,
      totalCount: input.totalCount,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: githubFetchState.resourceKey,
      set: {
        complete,
        truncated: !complete,
        loadedCount: loaded,
        totalCount: input.totalCount,
        fetchedAt: new Date(),
      },
    });
  return { loaded, added, complete };
}

async function syncNextDirection(input: {
  client: GitHubClient;
  login: string;
  rootId: string;
  direction: "followers" | "following";
  pageCap: number;
  syncRunId: string;
  totalCount: number;
}): Promise<{ loaded: number; added: number; complete: boolean }> {
  const resourceKey = `users/${input.login}/${input.direction}`;
  const [state] = await db
    .select()
    .from(githubFetchState)
    .where(eq(githubFetchState.resourceKey, resourceKey))
    .limit(1);
  if (state?.complete) return { loaded: state.loadedCount, added: 0, complete: true };
  const previouslyLoaded = state?.loadedCount ?? 0;
  return syncDirection({
    ...input,
    startPage: nextPageForLoaded(previouslyLoaded),
    previouslyLoaded,
  });
}

async function processSync(
  data: Extract<OrbitJob, { name: "sync-account" }>["data"],
): Promise<void> {
  await markSync(data.syncRunId, {
    status: "running",
    stage: "loading_profile",
    startedAt: new Date(),
  });
  const token = await credentialsFor(data.accountId);
  const client = new GitHubClient(token);
  const viewer = await client.getViewer();
  const rootId = await upsertProfile(viewer.data);
  await db
    .update(accounts)
    .set({ githubUserId: rootId, lastActiveAt: new Date() })
    .where(eq(accounts.id, data.accountId));

  const followers = await syncDirection({
    client,
    login: viewer.data.login,
    rootId,
    direction: "followers",
    pageCap: 50,
    syncRunId: data.syncRunId,
    totalCount: viewer.data.followers,
  });
  const following = await syncDirection({
    client,
    login: viewer.data.login,
    rootId,
    direction: "following",
    pageCap: 50,
    syncRunId: data.syncRunId,
    totalCount: viewer.data.following,
  });
  await markSync(data.syncRunId, {
    stage: "loading_repositories",
    progress: { followers, following },
  });
  const repos = await client.listRepositories(viewer.data.login);
  await storeRepositories(rootId, repos.data);
  await markSync(data.syncRunId, {
    stage: "enriching_candidates",
    progress: { followers, following },
  });
  const enrichedCandidates = await enrichCandidateProfiles(client, rootId);

  await addOrbitJob(
    { name: "embed-users", data: { accountId: data.accountId } },
    { jobId: `embed-${data.accountId}-${Date.now()}` },
  );
  await addOrbitJob(
    { name: "rank-account", data: { accountId: data.accountId } },
    { jobId: `rank-${data.accountId}-${Date.now()}`, delay: config.OPENROUTER_API_KEY ? 5_000 : 0 },
  );
  await markSync(data.syncRunId, {
    status: "completed",
    stage: "completed",
    progress: { followers, following, enrichedCandidates },
    completedAt: new Date(),
  });
}

async function processExpand(
  data: Extract<OrbitJob, { name: "expand-user" }>["data"],
): Promise<void> {
  await markSync(data.syncRunId, {
    status: "running",
    stage: "loading_profile",
    startedAt: new Date(),
  });
  const client = new GitHubClient(await credentialsFor(data.accountId));
  const profile = await client.getUser(data.login);
  const rootId = await upsertProfile(profile.data);
  const results: Record<string, unknown> = {};
  if (data.direction === "followers" || data.direction === "both") {
    results.followers = await syncNextDirection({
      client,
      login: data.login,
      rootId,
      direction: "followers",
      pageCap: 25,
      syncRunId: data.syncRunId,
      totalCount: profile.data.followers,
    });
  }
  if (data.direction === "following" || data.direction === "both") {
    results.following = await syncNextDirection({
      client,
      login: data.login,
      rootId,
      direction: "following",
      pageCap: 25,
      syncRunId: data.syncRunId,
      totalCount: profile.data.following,
    });
  }
  const repos = await client.listRepositories(data.login);
  await storeRepositories(rootId, repos.data);
  await addOrbitJob({
    name: "embed-users",
    data: { accountId: data.accountId, userIds: [rootId] },
  });
  await addOrbitJob(
    { name: "rank-account", data: { accountId: data.accountId } },
    { delay: config.OPENROUTER_API_KEY ? 3_000 : 0 },
  );
  await markSync(data.syncRunId, {
    status: "completed",
    stage: "completed",
    progress: results,
    completedAt: new Date(),
  });
}

async function processEmbeddings(
  data: Extract<OrbitJob, { name: "embed-users" }>["data"],
): Promise<void> {
  if (!config.OPENROUTER_API_KEY) return;
  const selected = await db
    .select()
    .from(githubUsers)
    .where(
      data.userIds?.length
        ? inArray(githubUsers.id, data.userIds)
        : isNull(githubUsers.unavailableAt),
    )
    .limit(50);
  const inputs: string[] = [];
  const metadata: Array<{
    id: string;
    hash: string;
    languages: Record<string, number>;
    topics: string[];
  }> = [];
  for (const user of selected) {
    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.ownerUserId, user.id))
      .limit(10);
    const text = buildProfileText({
      bio: user.bio,
      company: user.company,
      location: user.location,
      repositories: repos.map((repo) => ({
        name: repo.name,
        description: repo.description,
        topics: repo.topics,
        language: Object.keys(repo.languages)[0] ?? null,
      })),
    });
    if (!text) continue;
    const languages = repos.reduce<Record<string, number>>((result, repo) => {
      for (const [language, weight] of Object.entries(repo.languages))
        result[language] = (result[language] ?? 0) + weight;
      return result;
    }, {});
    const topics = [...new Set(repos.flatMap((repo) => repo.topics))].slice(0, 30);
    inputs.push(text);
    metadata.push({ id: user.id, hash: profileTextHash(text), languages, topics });
  }
  if (!inputs.length) return;
  const embeddings = await new OpenRouterClient().embed(inputs);
  for (let index = 0; index < embeddings.length; index += 1) {
    const item = metadata[index];
    const embedding = embeddings[index];
    if (!item || !embedding) continue;
    await pool.query(
      `INSERT INTO user_features
         (github_user_id, languages, topics, profile_text_hash, profile_text_version, embedding, embedding_version, calculated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6::vector, $7, now())
       ON CONFLICT (github_user_id) DO UPDATE SET
         languages = EXCLUDED.languages,
         topics = EXCLUDED.topics,
         profile_text_hash = EXCLUDED.profile_text_hash,
         profile_text_version = EXCLUDED.profile_text_version,
         embedding = EXCLUDED.embedding,
         embedding_version = EXCLUDED.embedding_version,
         calculated_at = now()`,
      [
        item.id,
        JSON.stringify(item.languages),
        item.topics,
        item.hash,
        PROFILE_TEXT_VERSION,
        `[${embedding.join(",")}]`,
        `${config.OPENROUTER_MODEL}:${config.OPENROUTER_DIMENSIONS}:${PROFILE_TEXT_VERSION}`,
      ],
    );
  }
}

async function processRanking(
  data: Extract<OrbitJob, { name: "rank-account" }>["data"],
): Promise<void> {
  const accountRows = await pool.query<{ root_id: string }>(
    "SELECT github_user_id AS root_id FROM accounts WHERE id = $1",
    [data.accountId],
  );
  const rootId = accountRows.rows[0]?.root_id;
  if (!rootId) return;
  const rootFeatureRows = await pool.query<{ topics: string[]; languages: Record<string, number> }>(
    "SELECT topics, languages FROM user_features WHERE github_user_id = $1",
    [rootId],
  );
  const rootFeatures = rootFeatureRows.rows[0] ?? { topics: [], languages: {} };
  const candidateRows = await pool.query<{
    id: string;
    followers_count: number;
    activity_at: Date | null;
    common_count: string;
    topics: string[] | null;
    languages: Record<string, number> | null;
    embedding_similarity: number | null;
  }>(
    `WITH direct AS (
       SELECT target_user_id AS id FROM follow_edges WHERE source_user_id = $1
     ), second_hop AS (
       SELECT fe.target_user_id AS id, count(*) AS common_count
       FROM follow_edges fe
       JOIN direct d ON d.id = fe.source_user_id
       WHERE fe.target_user_id <> $1
         AND NOT EXISTS (
           SELECT 1 FROM follow_edges existing
           WHERE existing.source_user_id = $1 AND existing.target_user_id = fe.target_user_id
       )
       GROUP BY fe.target_user_id
     ), inbound AS (
       SELECT fe.source_user_id AS id, 1::bigint AS common_count
       FROM follow_edges fe
       WHERE fe.target_user_id = $1
         AND fe.source_user_id <> $1
         AND NOT EXISTS (
           SELECT 1 FROM follow_edges existing
           WHERE existing.source_user_id = $1 AND existing.target_user_id = fe.source_user_id
         )
     ), candidates AS (
       SELECT id, sum(common_count)::bigint AS common_count
       FROM (
         SELECT id, common_count FROM second_hop
         UNION ALL
         SELECT id, common_count FROM inbound
       ) candidate_pool
       GROUP BY id
       ORDER BY sum(common_count) DESC
       LIMIT 2000
     )
     SELECT gu.id, gu.followers_count, gu.activity_at, c.common_count,
            uf.topics, uf.languages,
            CASE WHEN root.embedding IS NOT NULL AND uf.embedding IS NOT NULL
              THEN 1 - (root.embedding <=> uf.embedding) ELSE NULL END AS embedding_similarity
     FROM candidates c
     JOIN github_users gu ON gu.id = c.id
     LEFT JOIN user_features uf ON uf.github_user_id = gu.id
     LEFT JOIN user_features root ON root.github_user_id = $1
     WHERE gu.unavailable_at IS NULL AND gu.is_bot = false`,
    [rootId],
  );
  const ranked = candidateRows.rows
    .map((candidate) => {
      const topics = candidate.topics ?? [];
      const languages = Object.keys(candidate.languages ?? {});
      const commonCount = Number(candidate.common_count);
      const daysSinceActivity = candidate.activity_at
        ? Math.max(0, (Date.now() - candidate.activity_at.getTime()) / 86_400_000)
        : 365;
      const features: RankingFeatures = {
        pageRank: Math.min(1, Math.log1p(commonCount) / Math.log(8)),
        commonNeighbors: Math.min(1, commonCount / 6),
        embeddingSimilarity: Math.max(0, candidate.embedding_similarity ?? 0),
        topicSimilarity: jaccard(rootFeatures.topics ?? [], topics),
        languageSimilarity: jaccard(Object.keys(rootFeatures.languages ?? {}), languages),
        activity: Math.exp(-daysSinceActivity / 180),
        exploration: 0.5,
      };
      const { score } = scoreCandidate(features);
      return {
        id: candidate.id,
        score,
        features,
        reasons: explanationReasons(features, {
          mutualCount: commonCount,
          sharedTopics: topics.filter((topic) => rootFeatures.topics.includes(topic)),
          sharedLanguages: languages.filter((language) => language in rootFeatures.languages),
        }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
  await db
    .delete(recommendations)
    .where(
      and(
        eq(recommendations.viewerAccountId, data.accountId),
        eq(recommendations.rankerVersion, RANKER_VERSION),
      ),
    );
  if (ranked.length) {
    await db.insert(recommendations).values(
      ranked.map((candidate, index) => ({
        viewerAccountId: data.accountId,
        candidateUserId: candidate.id,
        score: candidate.score,
        rank: index + 1,
        features: candidate.features,
        reasons: candidate.reasons,
        rankerVersion: RANKER_VERSION,
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    );
  }
}

async function processCleanup(): Promise<void> {
  await db
    .delete(syncRuns)
    .where(
      and(
        lt(syncRuns.createdAt, new Date(Date.now() - 30 * 86_400_000)),
        eq(syncRuns.status, "completed"),
      ),
    );
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  await pool.query(
    "DELETE FROM share_tokens WHERE revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days'",
  );
}

async function handler(job: Job): Promise<void> {
  await touchHeartbeat();
  try {
    switch (job.name as OrbitJob["name"]) {
      case "sync-account":
        await processSync(job.data);
        break;
      case "expand-user":
        await processExpand(job.data);
        break;
      case "embed-users":
        await processEmbeddings(job.data);
        break;
      case "rank-account":
        await processRanking(job.data);
        break;
      case "cleanup":
        await processCleanup();
        break;
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  } catch (error) {
    const syncRunId = typeof job.data?.syncRunId === "string" ? job.data.syncRunId : undefined;
    if (error instanceof GitHubApiError && error.retryable && syncRunId) {
      const resetAt =
        error.rateLimit.resetAt ??
        new Date(Date.now() + (error.rateLimit.retryAfterSeconds ?? 60) * 1000);
      await markSync(syncRunId, {
        status: "waiting_rate_limit",
        stage: "waiting_rate_limit",
        rateLimitResetAt: resetAt,
        errorCode: `github_${error.status}`,
        errorMessage: error.message,
      });
    } else if (syncRunId) {
      await markSync(syncRunId, {
        status: "failed",
        stage: "failed",
        errorCode: error instanceof GitHubApiError ? `github_${error.status}` : "worker_error",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      });
    }
    throw error;
  }
}

const worker = new Worker(QUEUE_NAME, handler, {
  connection: getRedisConnection(),
  concurrency: 2,
  limiter: { max: 120, duration: 60_000 },
});

worker.on("completed", (job) =>
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "job completed", job: job.name, id: job.id })}\n`,
  ),
);
worker.on("failed", (job, error) =>
  process.stderr.write(
    `${JSON.stringify({ level: "error", message: "job failed", job: job?.name, id: job?.id, error: error.message })}\n`,
  ),
);

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "worker shutting down", signal })}\n`,
  );
  await worker.close();
  await closeQueues();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.stdout.write(`${JSON.stringify({ level: "info", message: "orbit worker ready" })}\n`);
