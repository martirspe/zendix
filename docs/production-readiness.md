# Release readiness — 2026-10-21

## Decision

**GO with conditions for controlled local operator testing. NO-GO for a public commercial email marketing release.**

The production artifacts build and have been exercised privately in Docker. A public deployment, real provider credentials, real DNS propagation, received-message authentication and inbox delivery are not yet verified. The configured console hostname is app.zendix.site and the operator supplied VPS address 178.104.132.74. The operator will perform deployment.

## Evidence

- Angular/NestJS strict builds pass. Production Docker images build from a lockfile with pinned base image digests.
- Twenty-three unit tests pass, including mocked Cloudflare batch configuration, SPF query-budget checks, credential AAD isolation and SMTP uncertainty handling.
- API smoke tests pass for JWT authentication, session rotation, refresh replay invalidation, logout revocation, viewer/owner boundaries, DTO/style validation, cross-tenant isolation and opt-out preservation.
- SMTP integration tests pass on a dedicated database with a simulated transport. They verify durable idempotency, no replay after acceptance/lost acknowledgement/interrupted submission, signed GET/POST unsubscribe semantics and suppression immediately before transport. No real message is sent by these checks.
- Production API, static server, PostgreSQL and Redis boot healthy with secret files, read-only application filesystems and no public service ports. The API runs as uid 1000. The migration task exits successfully.
- The production image smoke verifies Secure/HttpOnly/SameSite cookies, Origin enforcement and immediate access-token invalidation after logout. Caddy configuration validates without obtaining a public certificate.
- A custom-format PostgreSQL dump was restored into a separately created temporary database; schema, synthetic data and credential decryption were checked with the matching vault key. Temporary restore databases were removed afterward.
- npm audit reports zero known vulnerabilities for the resolved dependencies at the time of verification. Container OS CVE scanning and an external penetration test have not been performed.
- Initial workspace state had no Git metadata. No commit, push or public deployment was created.

## Remaining release gates

1. Deploy app.zendix.site on the chosen VPS and validate public HTTPS, off-host backups and alert delivery there.
2. Enter SMTP and Cloudflare credentials through the authenticated console. Confirm authorized DNS changes and receive the requested preview with aligned DKIM/SPF/DMARC. No real credentials were read from files or printed by the agent.
3. Implement and validate authenticated provider events for delivery, hard/soft bounce and complaint suppression before enabling bulk campaign dispatch. Preview acceptance must not be treated as delivery.
4. Complete audience/list/segment selection, campaign review/scheduling/A-B, tracking/analytics, expanded email blocks/VML and cross-client rendering checks before claiming the Constitution's complete Core.
5. Complete email confirmation/double opt-in and broader commercial account operations before opening public registration.

## Operator test case

The requested case is an individual preview from `noreply@reclamofacil.com` to `rosonoem@gmail.com`, with Cloudflare managing the sender domain. Those values are local development defaults only; they are not embedded in the public production JavaScript bundle. Account ID and SMTP username are separate fields. A zone-scoped Cloudflare API token is needed to install records from the console.




## Current deployment automation

See automatic-deployment.md for the Habix-style shared-host flow. Four isolated orchestration tests cover preflight, retained secrets, backup-before-migration ordering and aborts on failed build/backup. Authentication no longer requires a pasted workspace UUID. The editor review reports actual saved prerequisites; it does not enable commercial campaigns. Public Nginx/Certbot/firewall behavior remains unverified until the operator runs deployment on the VPS.
