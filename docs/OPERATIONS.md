# Operations

## Health and startup

- `/health/live` confirms that the web process can serve requests.
- `/health/ready` confirms required connected-mode configuration plus PostgreSQL and Redis connectivity. Demo mode returns ready without external dependencies.
- The worker writes a heartbeat every 30 seconds; its container health check fails when the heartbeat is older than 90 seconds.

Docker Compose runs migrations as a one-shot dependency before starting the web and worker. Migration files are ordered, transactional, and recorded in `orbit_migrations`.

## Backups

Start the optional local backup sidecar with:

```bash
docker compose --profile backup up -d backup
```

It writes scheduled PostgreSQL dumps under `./backups`, which is intentionally ignored by Git. A production deployment should copy encrypted backups off-host, restrict bucket credentials to the backup target, and regularly rehearse a restore into a separate database.

Redis uses append-only persistence but is not the system of record. Losing Redis discards queued work and short-lived OAuth state; durable graph and user data remain in PostgreSQL. A manual sync can recreate missing jobs.

## Monitoring signals

Alert on:

- web readiness failures or repeated worker heartbeat failures
- `sync_runs` stuck in `running` or `waiting_rate_limit`
- BullMQ failed-job growth and retry exhaustion
- GitHub 401/403 responses, which can indicate revoked credentials or rate limits
- OpenRouter 429/5xx responses and embedding dimension mismatches
- database storage, connection saturation, and backup freshness

The worker emits one-line structured JSON for ready, completion, failure, and shutdown events. Sync errors retain a stable code, safe message, and rate-limit reset timestamp for the settings UI and operational queries.

## Release verification

Before deployment:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
docker compose config --quiet
```

After deployment, check `/health/live`, `/health/ready`, sign in with an invited account, complete one initial sync, expand a node, generate recommendations, save one person, and create/revoke a shared map link.
