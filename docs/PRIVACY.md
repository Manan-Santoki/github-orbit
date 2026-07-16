# Privacy and security model

Orbit is designed around public GitHub data and progressive permission.

- Sign-in requests no private-repository or organization scope.
- Follow permission is requested only after an explicit follow action and stored separately from the read token.
- OAuth credentials use AES-256-GCM encryption at rest. Session, OAuth-state, and share-link secrets are stored as hashes where recovery is unnecessary.
- Collections, private notes, feedback, and saved-map ownership never appear in public share responses.
- Secret map links are unguessable, hash-backed, revocable, excluded from indexing, and show a read-only subset of public profile data.
- Browser responses set CSP, frame, MIME-sniffing, referrer, and permissions policies. Mutations validate the account owner and request origin.
- OpenRouter enrichment contains only deterministic text derived from public profile and public repository fields.

Account deletion revokes all active sessions by cascade and removes OAuth credentials, recommendations, feedback, collections, maps, and share links. It also removes the account's root cached GitHub profile if no other account identity references it. Public profiles encountered through other users' networks are a shared cache and may be re-fetched from GitHub.

For production, provide secrets with Docker/Kubernetes secret files through the supported `_FILE` variables, restrict access to `.env`, rotate the token encryption key through a planned re-encryption operation, and keep database backups encrypted outside the application host.
