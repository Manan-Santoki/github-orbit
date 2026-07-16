# Security policy

## Reporting a vulnerability

Do not report suspected vulnerabilities in public issues or discussions. Use GitHub's **Report a vulnerability** flow in the repository Security tab so the report and any reproduction details remain private.

Include the affected version or commit, impact, reproduction steps, and any suggested mitigation. Do not include live OAuth tokens, encryption keys, session cookies, database exports, or personal GitHub network data. Revoke any credential that may have been exposed before sending the report.

The project will acknowledge a complete report as soon as practical, investigate it, and coordinate disclosure after a fix is available. No guaranteed response or remediation timeline is offered.

## Supported versions

Security fixes target the current `main` branch. Self-hosters should keep dependencies and container images updated, encrypt backups, restrict access to `.env`, and review the deployment guidance in [docs/OPERATIONS.md](docs/OPERATIONS.md).
