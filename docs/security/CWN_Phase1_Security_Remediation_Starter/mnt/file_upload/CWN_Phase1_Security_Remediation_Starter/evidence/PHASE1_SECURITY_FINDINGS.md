# Phase 1 Security Findings — Initial Evidence

## Status

Remediation started. Production remains blocked.

## Finding S-01 — Client-side administrator credential

Evidence from the supplied Admin Portal source:

- The login interface states that default credentials are stored in the Admin JavaScript.
- The JavaScript defines a default username and a default password.
- Credential changes are stored in browser localStorage.
- Session state is stored in browser sessionStorage.

The credential value is not reproduced here.

### Required response

- Remove the hard-coded credential from every public/client artifact.
- Rotate the credential anywhere it was reused or exposed.
- Review repository history and prior drafts.
- Replace browser authorization with server-side authentication and authorization.

## Finding S-02 — Privileged Admin Portal delivered as client content

The supplied Admin Portal source includes privileged controls for alerts, weather overrides, ticker overrides, audio, graphics, diagnostics, AI controls, and settings. The CWN checklist requires confirmation that privileged controls and private data are not delivered to public pages.

### Required response

- Serve the Admin Portal only from a protected private route.
- Keep public weather pages in a separate public content root.
- Test direct URL access without a session.

## Foundation implemented in this package

- Server-side password verification.
- Server-side sessions.
- Role checks.
- Owner-only World Between Worlds restriction.
- Protected Admin route.
- Session expiration and logout.
- CSRF protection for logout and future state-changing routes.
- Audit log records for login, logout, denied access, and server errors.
- Targeted secret scanner.
- Negative access tests.

## Remaining gates

- Credential rotation is an owner action and cannot be performed from this package.
- Full repository and history secret scanning has not run because the complete repository history is not present here.
- The existing Admin Portal has not yet been moved behind the private route.
- Durable session storage, account storage, multi-factor authentication, recovery controls, and deployment configuration remain to be selected and validated.
- No Production release is authorized.
