# Contributing to GitHub Orbit

Thanks for helping improve GitHub Orbit. Bug fixes, accessibility improvements, documentation, tests, and focused product enhancements are welcome.

## Development setup

Use Node.js 24+ and pnpm 10.26+.

```bash
pnpm install
DEMO_MODE=true pnpm dev
```

Demo mode is the fastest way to work on the interface and does not require GitHub credentials, PostgreSQL, Redis, or OpenRouter. For connected-mode development, follow the OAuth and Docker instructions in the README and keep all credentials in an ignored `.env` file.

## Before opening a pull request

Run the complete local verification suite:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
cp .env.example .env
docker compose config --quiet
```

Do not commit `.env`, OAuth credentials, access tokens, database exports, logs, screenshots containing private notes, or production network data. Add tests for behavior changes when practical and keep pull requests focused.

## Pull requests

Explain the user-facing problem, the chosen solution, relevant tradeoffs, and the checks you ran. UI changes should include a screenshot or short recording using demo data. Database changes must use a new ordered migration and document rollback considerations.

By contributing, you agree that your contribution is licensed under the MIT License.
