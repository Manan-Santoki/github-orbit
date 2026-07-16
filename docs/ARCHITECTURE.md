# Architecture

## Runtime flow

```text
Browser ──HTTPS──> Caddy ──> Next.js web/API
                              │       │
                              │       ├──> PostgreSQL + pgvector
                              │       └──> Redis / BullMQ
                              │                  │
                              │               Worker
                              │              /      \
                              └──── GitHub REST      OpenRouter embeddings
```

The web process handles authentication, read APIs, user mutations, and server-rendered application shells. Expensive or rate-limited work is always queued. The worker owns GitHub ingestion, profile enrichment, embedding generation, ranking, and retention cleanup.

## Authentication and authorization

1. The sign-in route generates an OAuth state value and PKCE verifier.
2. Only a SHA-256 hash of the state is placed in the short-lived cookie; the verifier and return path live in Redis for ten minutes.
3. The callback atomically consumes the Redis state, exchanges the code, reads the authenticated profile, and enforces the invitation allowlist.
4. OAuth tokens are encrypted with AES-256-GCM before storage. Session and share-link tokens are stored only as SHA-256 hashes.
5. The first connection requests no extra scope. `user:follow` is stored separately after a progressive authorization flow and is used only for explicit follow/unfollow actions.

Administrator access requires either the database role or a login in `ADMIN_GITHUB_LOGINS`. Collection, map, invite, follow, feedback, refresh, logout, and deletion mutations are scoped to the current account and checked for same-origin requests.

## Ingestion

An initial sync fetches the viewer profile, both directions of the direct network, and the viewer's ten most recently updated non-fork repositories. It then enriches up to 20 follower-only discovery candidates with their public profile and recent non-fork repositories. Each page is committed incrementally so partial progress survives rate limits. Every resource records loaded count, completion, truncation, and fetch time.

Expansion is deliberate, progressive, and resumable. Selecting a graph node can enqueue twenty-five new pages in each direction plus public repository enrichment for that person. A later batch starts at the next unloaded page instead of repeating page one. Jobs retry with exponential backoff; the client polls its specific sync record, which exposes queued, running, waiting-for-rate-limit, completed, or failed state.

## Graph storage and delivery

Follow relationships are directed edges: `source_user_id` follows `target_user_id`. Mutual status is derived from the presence of both directed edges. The API selects the viewer, direct neighbors, and a bounded set of second-hop nodes, then returns a normalized graph contract used by both the WebGL canvas and accessible list view.

Sigma renders the interactive graph on the client and ForceAtlas2 computes an initial clustered layout. The WebGL module is isolated behind a client-only boundary so server rendering and production builds do not require browser globals.

## Data model

The principal tables are:

- `github_users`, `follow_edges`, `repositories`, and `github_fetch_state` for the public graph cache
- `accounts`, `github_oauth_credentials`, `sessions`, and `invites` for identity and access
- `user_features`, `recommendations`, and `recommendation_feedback` for discovery
- `collections` and `collection_members` for private curation
- `saved_maps`, map node/edge tables, and `share_tokens` for snapshots
- `sync_runs` and `audit_events` for operational visibility

Foreign keys and cascade rules delete account-private data together. Deleting an account also deletes its root cached GitHub profile when no account references it; shared public profiles can be reacquired later through another user's public network sync.

## Deployment boundaries

PostgreSQL and Redis exist only on an internal Docker network. The web and worker also join a separate egress network because OAuth exchange, GitHub REST, and OpenRouter require outbound HTTPS. Only Caddy publishes host ports.
