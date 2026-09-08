# CWN Phase 1 Security Remediation Starter

Status: Draft / Sandbox only

This package begins the immediate security-stabilization work required by the CWN execution checklist. It does not authorize Production deployment.

## Confirmed issue addressed

The supplied Admin Portal source includes administrator credentials in client-side JavaScript and stores credentials/session state in browser storage. This package removes that design from the authentication path and replaces it with a server-side session boundary.

The exposed credential value is intentionally not repeated in this package. Rotate that credential anywhere it may have been reused, including repository history and previous drafts.

## Included

- A dependency-free Node.js security foundation using built-in modules only.
- Server-side password verification using `crypto.scrypt`.
- Server-side sessions with random identifiers.
- HttpOnly, SameSite=Strict session cookies.
- CSRF tokens for state-changing requests.
- Role checks for `admin`, `power_admin`, and `world_between_worlds`.
- Explicit Tanner-only `world_between_worlds` policy through one configured account.
- Session expiration, logout, denied-access handling, and protected-route behavior.
- Separate public and private-admin content roots.
- A client authentication adapter that replaces localStorage/sessionStorage authorization.
- A targeted repository secret scanner.
- Security smoke tests.
- A remediation evidence record and integration checklist.

## Deliberate limitations

This starter uses an in-memory session store, so sessions are lost when the process restarts and are not shared across multiple server instances. Before Production, replace it with an approved durable server-side session store and complete the CWN release gates.

## Safe execution order

1. Rotate the exposed administrator credential before using this package.
2. Keep the existing public site unchanged while testing this package in Sandbox.
3. Generate a password hash locally; do not place a plaintext password in source or configuration.
4. Copy `.env.example` to an uncommitted environment file and add only non-public values.
5. Start the server and run the smoke tests.
6. Move the real Admin Portal markup and scripts into `private-admin/` only after the protected-route tests pass.
7. Remove the old client-side `Auth` block and use `admin-auth-client.js`.
8. Run the secret scanner across the complete repository and history before commit.
9. Open a draft pull request with evidence; do not publish to Production until approval and release gates pass.

## Commands

```bash
cd security-foundation
node scripts/generate-password-hash.mjs
node server.mjs
node tests/security-smoke.mjs
python ../secret_scan.py /path/to/complete/repository
```

## Required environment values

See `security-foundation/.env.example`. Load them through the hosting platform's secret/environment configuration. Do not commit a real environment file.
