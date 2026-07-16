# GitHub Orbit

[![CI](https://github.com/Manan-Santoki/github-orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/Manan-Santoki/github-orbit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-85f0ca.svg)](LICENSE)

GitHub Orbit is a self-hostable network explorer for GitHub. Connect a GitHub account, browse followers, following, mutuals, and second-hop communities on an infinite canvas, then get explainable recommendations for people worth following.

The repository contains a runnable product, not a static prototype:

- GitHub OAuth with PKCE, hashed sessions, invite-only access, and read-only scopes by default
- Progressive `user:follow` permission requested only when a user follows from Orbit
- Directed follower/following graph with search, relationship filters, list fallback, profile details, and on-demand expansion
- Deterministic recommendations combining network, profile similarity, topics, languages, activity, and exploration
- Optional OpenRouter embeddings through `openai/text-embedding-3-large`
- Private collections, saved map snapshots, revocable secret share links, feedback, and account deletion
- Background synchronization with BullMQ, rate-limit state, retries, and partial-coverage metadata
- PostgreSQL 17 + pgvector, Redis, Caddy, Docker Compose, health checks, migrations, and backup profile
- A built-in demo dataset, so the complete UI runs without credentials or infrastructure

## Run the demo

Requirements: Node.js 24+ and pnpm 10.26+.

```bash
pnpm install
DEMO_MODE=true pnpm dev
```

Open `http://localhost:3000`. Demo mode uses realistic local fixtures and does not call GitHub, OpenRouter, PostgreSQL, or Redis.

## Connect your GitHub account

### 1. Create the OAuth app

Create a GitHub OAuth App with:

- Homepage URL: `http://localhost:3010`
- Authorization callback URL: `http://localhost:3010/auth/github/callback`

Orbit asks for no additional OAuth scope at sign-in, which is enough for public account data. The `user:follow` scope is a separate authorization flow initiated only when needed.

### 2. Configure the environment

```bash
cp .env.example .env
openssl rand -base64 32
```

Set `DEMO_MODE=false`, add the GitHub client ID and secret, paste the generated value into `TOKEN_ENCRYPTION_KEY`, and replace `your-github-login` in `ADMIN_GITHUB_LOGINS`. Keep `PERSONAL_MODE=true` for an individual installation. Only that existing account can sign in after setup.

If `ADMIN_GITHUB_LOGINS` is left empty, the first GitHub identity to finish OAuth becomes the personal administrator. Complete that first sign-in on localhost before exposing Orbit to a network. Multi-user private installations should set `PERSONAL_MODE=false` and use `ADMIN_GITHUB_LOGINS` plus invitations.

`OPENROUTER_API_KEY` is optional. Without it, recommendations still use the network, topics, languages, and activity; the semantic feature remains zero.

### 3. Start the stack

```bash
docker compose up --build -d
```

Open the `APP_URL` from `.env` (the default local container port is `http://localhost:3010`). Caddy can additionally serve the stack through `https://localhost`; its local certificate may require trust configuration.

For a multi-user installation, create an invitation after the stack is running:

```bash
docker compose run --rm migrate pnpm db:seed invited-github-login
```

To develop the web and worker on the host:

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed your-github-login
pnpm dev
```

In a second terminal:

```bash
pnpm dev:worker
```

## Useful commands

```bash
pnpm typecheck       # strict TypeScript across every workspace
pnpm test            # ranking, encryption, and integration contract tests
pnpm build           # production web and worker artifacts
pnpm db:migrate      # idempotent SQL migrations
pnpm db:seed LOGIN   # create or reactivate a private-beta invite
pnpm format:check    # formatting verification
```

## Workspace layout

```text
apps/web             Next.js application, APIs, OAuth, and interactive UI
apps/worker          BullMQ ingestion, enrichment, ranking, and cleanup jobs
packages/config      validated runtime configuration and secret-file support
packages/core        graph contracts, crypto, demo data, and deterministic ranker
packages/db          Drizzle schema, PostgreSQL pool, migrations, and invite seed
packages/integrations GitHub REST/OAuth and OpenRouter embedding clients
packages/queues      typed BullMQ jobs and Redis connection
infra                production Dockerfile and Caddy configuration
docs                 architecture, ranking, privacy, and operations notes
```

## Product limits

- Initial direct sync loads up to 5,000 followers and 5,000 following accounts per user. Coverage is explicitly marked complete or truncated.
- The initial sync enriches up to 20 follower-only discovery candidates with public profiles and recent non-fork repositories so recommendations are useful immediately.
- An on-demand expansion resumes from the previous cursor and loads up to 2,500 additional followers and 2,500 additional following accounts for the selected person per batch.
- The graph response is capped at 10,000 nodes and 40,000 visible edges to keep interaction smooth; the stored graph can be much larger and coverage remains explicit.
- Saved maps accept up to 5,000 nodes and 20,000 edges.
- Only public profiles, relationships, and public repository metadata are ingested. Orbit never requests private repository access.

More detail is in [architecture](docs/ARCHITECTURE.md), [ranking](docs/RANKING.md), [privacy](docs/PRIVACY.md), and [operations](docs/OPERATIONS.md).

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not through a public issue.

GitHub Orbit is available under the [MIT License](LICENSE). It is an independent project and is not affiliated with or endorsed by GitHub, Inc. GitHub is a trademark of GitHub, Inc.
