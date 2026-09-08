# CWN Phase 1 Integration Checklist

- [ ] Rotate all credentials that appeared in source, history, or drafts.
- [ ] Scan the complete repository working tree with `secret_scan.py`.
- [ ] Review the complete Git history with the repository's approved secret-scanning method.
- [ ] Create `feature/cwn-command-center-foundation` from the current default branch.
- [ ] Keep the public weather site in a public-only content root.
- [ ] Move reviewed Admin Portal HTML/CSS/JS into the protected private-admin root.
- [ ] Delete the client-side Auth object, default credential constants, password reset storage, and sessionStorage authorization.
- [ ] Connect the existing login form to `/api/auth/login`.
- [ ] Connect Admin startup to `/api/auth/session`.
- [ ] Connect Sign Out to `/api/auth/logout` with CSRF.
- [ ] Implement approved durable users, roles, and sessions.
- [ ] Verify `world_between_worlds` is restricted to the approved owner account.
- [ ] Add denied-access, role, expiry, logout, and protected-route tests.
- [ ] Confirm private Admin markup is not present in public responses or bundles.
- [ ] Attach scan output and test evidence to a draft pull request.
- [ ] Do not merge or publish until the exact scope is approved and all foundation release gates pass.
