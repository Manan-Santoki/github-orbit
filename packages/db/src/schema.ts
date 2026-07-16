import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { RankingFeatures } from "@github-orbit/core/ranking";
import type { RecommendationReason } from "@github-orbit/core";

export const accountRole = pgEnum("account_role", ["user", "admin"]);
export const accountStatus = pgEnum("account_status", ["active", "disabled", "deleting"]);
export const syncStatus = pgEnum("sync_status", [
  "queued",
  "running",
  "waiting_rate_limit",
  "completed",
  "failed",
]);
export const feedbackAction = pgEnum("feedback_action", [
  "open",
  "save",
  "follow",
  "dismiss",
  "less_like_this",
]);

export const githubUsers = pgTable(
  "github_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: bigint("github_id", { mode: "bigint" }).notNull(),
    nodeId: text("node_id"),
    login: text("login").notNull(),
    name: text("name"),
    bio: text("bio"),
    company: text("company"),
    location: text("location"),
    avatarUrl: text("avatar_url").notNull(),
    htmlUrl: text("html_url").notNull(),
    accountType: text("account_type").notNull().default("User"),
    isBot: boolean("is_bot").notNull().default(false),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    publicReposCount: integer("public_repos_count").notNull().default(0),
    activityAt: timestamp("activity_at", { withTimezone: true }),
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("github_users_github_id_uq").on(table.githubId),
    uniqueIndex("github_users_login_lower_uq").on(table.login),
    index("github_users_activity_idx").on(table.activityAt),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubUserId: uuid("github_user_id")
      .notNull()
      .references(() => githubUsers.id),
    role: accountRole("role").notNull().default("user"),
    status: accountStatus("status").notNull().default("active"),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("accounts_github_user_uq").on(table.githubUserId)],
);

export const oauthCredentials = pgTable("github_oauth_credentials", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  readTokenEncrypted: text("read_token_encrypted").notNull(),
  readScopes: text("read_scopes").array().notNull().default([]),
  followTokenEncrypted: text("follow_token_encrypted"),
  followScopes: text("follow_scopes").array().notNull().default([]),
  tokenUpdatedAt: timestamp("token_updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_account_idx").on(table.accountId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubLogin: text("github_login").notNull(),
    createdByAccountId: uuid("created_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("invites_login_uq").on(table.githubLogin)],
);

export const followEdges = pgTable(
  "follow_edges",
  {
    sourceUserId: uuid("source_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).defaultNow().notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceUserId, table.targetUserId] }),
    index("follow_edges_target_idx").on(table.targetUserId),
  ],
);

export const githubFetchState = pgTable("github_fetch_state", {
  resourceKey: text("resource_key").primaryKey(),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastStatus: integer("last_status"),
  complete: boolean("complete").notNull().default(false),
  truncated: boolean("truncated").notNull().default(false),
  loadedCount: integer("loaded_count").notNull().default(0),
  totalCount: integer("total_count"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: bigint("github_id", { mode: "bigint" }).notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    htmlUrl: text("html_url").notNull(),
    isFork: boolean("is_fork").notNull().default(false),
    stars: integer("stars").notNull().default(0),
    topics: text("topics").array().notNull().default([]),
    languages: jsonb("languages").$type<Record<string, number>>().notNull().default({}),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("repositories_github_id_uq").on(table.githubId),
    index("repositories_owner_idx").on(table.ownerUserId),
  ],
);

export const userFeatures = pgTable(
  "user_features",
  {
    githubUserId: uuid("github_user_id")
      .primaryKey()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    languages: jsonb("languages").$type<Record<string, number>>().notNull().default({}),
    topics: text("topics").array().notNull().default([]),
    profileTextHash: text("profile_text_hash"),
    profileTextVersion: text("profile_text_version").notNull().default("profile-template-v1"),
    embedding: vector("embedding", { dimensions: 1024 }),
    embeddingVersion: text("embedding_version"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_features_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: syncStatus("status").notNull().default("queued"),
    stage: text("stage").notNull().default("queued"),
    progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    rateLimitResetAt: timestamp("rate_limit_reset_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sync_runs_account_status_idx").on(table.accountId, table.status)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    viewerAccountId: uuid("viewer_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
    features: jsonb("features").$type<RankingFeatures>().notNull(),
    reasons: jsonb("reasons").$type<RecommendationReason[]>().notNull(),
    rankerVersion: text("ranker_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("recommendations_viewer_candidate_version_uq").on(
      table.viewerAccountId,
      table.candidateUserId,
      table.rankerVersion,
    ),
    index("recommendations_viewer_rank_idx").on(table.viewerAccountId, table.rank),
  ],
);

export const recommendationFeedback = pgTable("recommendation_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  viewerAccountId: uuid("viewer_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  candidateUserId: uuid("candidate_user_id")
    .notNull()
    .references(() => githubUsers.id, { onDelete: "cascade" }),
  action: feedbackAction("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerAccountId: uuid("owner_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectionMembers = pgTable(
  "collection_members",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    githubUserId: uuid("github_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    privateNote: text("private_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.githubUserId] })],
);

export const savedMaps = pgTable("saved_maps", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerAccountId: uuid("owner_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  viewport: jsonb("viewport").$type<{ x: number; y: number; ratio: number }>().notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const savedMapNodes = pgTable(
  "saved_map_nodes",
  {
    mapId: uuid("map_id")
      .notNull()
      .references(() => savedMaps.id, { onDelete: "cascade" }),
    githubUserId: uuid("github_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    x: real("x").notNull(),
    y: real("y").notNull(),
    pinned: boolean("pinned").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.mapId, table.githubUserId] })],
);

export const savedMapEdges = pgTable(
  "saved_map_edges",
  {
    mapId: uuid("map_id")
      .notNull()
      .references(() => savedMaps.id, { onDelete: "cascade" }),
    sourceUserId: uuid("source_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("follow"),
  },
  (table) => [primaryKey({ columns: [table.mapId, table.sourceUserId, table.targetUserId] })],
);

export const shareTokens = pgTable(
  "share_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mapId: uuid("map_id")
      .notNull()
      .references(() => savedMaps.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    mapVersion: integer("map_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("share_tokens_hash_uq").on(table.tokenHash)],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  subject: text("subject"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
