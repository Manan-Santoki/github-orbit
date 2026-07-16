CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE account_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'disabled', 'deleting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('queued', 'running', 'waiting_rate_limit', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE feedback_action AS ENUM ('open', 'save', 'follow', 'dismiss', 'less_like_this');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS github_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id bigint NOT NULL UNIQUE,
  node_id text,
  login text NOT NULL,
  name text,
  bio text,
  company text,
  location text,
  avatar_url text NOT NULL,
  html_url text NOT NULL,
  account_type text NOT NULL DEFAULT 'User',
  is_bot boolean NOT NULL DEFAULT false,
  followers_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  public_repos_count integer NOT NULL DEFAULT 0,
  activity_at timestamptz,
  unavailable_at timestamptz,
  profile_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS github_users_login_lower_uq ON github_users (lower(login));
CREATE INDEX IF NOT EXISTS github_users_activity_idx ON github_users (activity_at DESC);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_user_id uuid NOT NULL UNIQUE REFERENCES github_users(id),
  role account_role NOT NULL DEFAULT 'user',
  status account_status NOT NULL DEFAULT 'active',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_oauth_credentials (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  read_token_encrypted text NOT NULL,
  read_scopes text[] NOT NULL DEFAULT '{}',
  follow_token_encrypted text,
  follow_scopes text[] NOT NULL DEFAULT '{}',
  token_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions (account_id);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_login text NOT NULL,
  created_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  expires_at timestamptz,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_login_uq ON invites (lower(github_login));

CREATE TABLE IF NOT EXISTS follow_edges (
  source_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_user_id, target_user_id),
  CHECK (source_user_id <> target_user_id)
);
CREATE INDEX IF NOT EXISTS follow_edges_target_idx ON follow_edges (target_user_id);

CREATE TABLE IF NOT EXISTS github_fetch_state (
  resource_key text PRIMARY KEY,
  etag text,
  last_modified text,
  last_status integer,
  complete boolean NOT NULL DEFAULT false,
  truncated boolean NOT NULL DEFAULT false,
  loaded_count integer NOT NULL DEFAULT 0,
  total_count integer,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id bigint NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  html_url text NOT NULL,
  is_fork boolean NOT NULL DEFAULT false,
  stars integer NOT NULL DEFAULT 0,
  topics text[] NOT NULL DEFAULT '{}',
  languages jsonb NOT NULL DEFAULT '{}'::jsonb,
  pushed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repositories_owner_idx ON repositories (owner_user_id);

CREATE TABLE IF NOT EXISTS user_features (
  github_user_id uuid PRIMARY KEY REFERENCES github_users(id) ON DELETE CASCADE,
  languages jsonb NOT NULL DEFAULT '{}'::jsonb,
  topics text[] NOT NULL DEFAULT '{}',
  profile_text_hash text,
  profile_text_version text NOT NULL DEFAULT 'profile-template-v1',
  embedding vector(1024),
  embedding_version text,
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_features_embedding_hnsw
  ON user_features USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL,
  status sync_status NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  rate_limit_reset_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_runs_account_status_idx ON sync_runs (account_id, status);

CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  score real NOT NULL CHECK (score >= 0 AND score <= 1),
  rank integer NOT NULL,
  features jsonb NOT NULL,
  reasons jsonb NOT NULL,
  ranker_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (viewer_account_id, candidate_user_id, ranker_version)
);
CREATE INDEX IF NOT EXISTS recommendations_viewer_rank_idx ON recommendations (viewer_account_id, rank);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  action feedback_action NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  github_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  private_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, github_user_id)
);

CREATE TABLE IF NOT EXISTS saved_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewport jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_map_nodes (
  map_id uuid NOT NULL REFERENCES saved_maps(id) ON DELETE CASCADE,
  github_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  x real NOT NULL,
  y real NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  PRIMARY KEY (map_id, github_user_id)
);

CREATE TABLE IF NOT EXISTS saved_map_edges (
  map_id uuid NOT NULL REFERENCES saved_maps(id) ON DELETE CASCADE,
  source_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'follow',
  PRIMARY KEY (map_id, source_user_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES saved_maps(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  map_version integer NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_account_created_idx ON audit_events (account_id, created_at DESC);
