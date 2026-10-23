# Release readiness — 2026-10-21

## Decision

**GO with conditions for controlled local operator testing. NO-GO for a public commercial email marketing release.**

The production artifacts build and have been exercised privately in Docker. A public deployment, real provider credentials, real DNS propagation, received-message authentication and inbox delivery are not yet verified. The configured console hostname is app.zendix.site and the operator supplied VPS address 178.104.132.74. The operator will perform deployment.

## Evidence

- Angular/NestJS strict builds pass. Production Docker images build from a lockfile with pinned base image digests.
- Twenty-eight unit tests pass, including mocked Cloudflare batch configuration, SPF query-budget checks, credential AAD isolation, Email API uncertainty handling, campaign confirmation tokens and signed provider events.
- API smoke tests pass for JWT authentication, session rotation, refresh replay invalidation, logout revocation, viewer/owner boundaries, DTO/style validation, cross-tenant isolation and opt-out preservation.
- Email API integration tests pass on a dedicated database with simulated transport and provider events. They verify encrypted tenant credentials, idempotency, uncertain-send protection, current-campaign confirmation, durable dispatch, webhook event deduplication, hard-bounce/complaint suppression and signed unsubscribe. No real message is sent by these checks.
- Production API, static server, PostgreSQL and Redis boot healthy with secret files, read-only application filesystems and no public service ports. The API runs as uid 1000. The migration task exits successfully.
- The production image smoke verifies Secure/HttpOnly/SameSite cookies, Origin enforcement and immediate access-token invalidation after logout. Caddy configuration validates without obtaining a public certificate.
- A custom-format PostgreSQL dump was restored into a separately created temporary database; schema, synthetic data and credential decryption were checked with the matching vault key. Temporary restore databases were removed afterward.
- npm audit reports zero known vulnerabilities for the resolved dependencies at the time of verification. Container OS CVE scanning and an external penetration test have not been performed.
- Initial workspace state had no Git metadata. No commit, push or public deployment was created.

## Remaining release gates

1. Deploy app.zendix.site on the chosen VPS and validate public HTTPS, off-host backups and alert delivery there.
2. Enter MailChannels Email API and Cloudflare credentials through the authenticated console. Confirm authorized DNS changes and receive the requested preview with aligned DKIM/SPF/DMARC. No real credentials were read from files or printed by the agent.
3. Deploy the receiver at a public HTTPS endpoint, connect a real MailChannels account, and complete its signed webhook challenge. The code verifies the provider signature over raw request bytes, rejects stale/future events, durably stores batches before acknowledgment, deduplicates/retries event processing, correlates request IDs, and suppresses hard bounces, complaints and provider unsubscribes. No production endpoint or provider credentials were available in this verification.
4. Enter real credentials through the authenticated console, complete MailChannels validation and confirm sender DNS/public HTTPS. Campaign confirmation revalidates the provider webhook and checks the current audience, consent, accepted preview and DNS. No external campaign is sent by local checks. MailChannels accounts currently have one webhook URL; coordinate ownership before connecting an account shared by another system. The integration uses API-managed DKIM keys.
5. Campaign scheduling with timezone retention and execution-time prerequisite checks, stable A/B subject assignment, MailChannels open/click tracking, and event-backed analytics (delivery, opens, clicks by link, bounces, complaints, unsubscribes and recent events) are implemented and covered by isolated Docker smoke checks. A/B reports compare the two subjects; automatic winner selection and an automatic second send are intentionally not implemented. Link rewriting to a tenant-owned custom tracking hostname and comprehensive cross-client rendering remain. Provider tracking depends on MailChannels account/plan support and public tracking infrastructure; local smoke uses simulated provider events.
6. Configure `AUTH_EMAIL_API_KEY_PATH` and a verified `AUTH_EMAIL_FROM_EMAIL` before relying on account email verification, one-time login or password recovery. Verify receipt through the deployed MailChannels account. Public registration remains disabled by default; enable it only after the email flow and account operations are verified.

## Operator test case

The requested case is an individual preview from `noreply@reclamofacil.com` to `rosonoem@gmail.com`, with Cloudflare managing the sender domain. Those values are local development defaults only; they are not embedded in the public production JavaScript bundle. The API key and Account ID are separate fields. A zone-scoped Cloudflare API token is needed to install records from the console.




## Current deployment automation

See automatic-deployment.md for the Habix-style shared-host flow. Four isolated orchestration tests cover preflight, retained secrets, backup-before-migration ordering and aborts on failed build/backup. Authentication no longer requires a pasted workspace UUID. The editor review reports actual saved prerequisites; it does not enable commercial campaigns. Public Nginx/Certbot/firewall behavior remains unverified until the operator runs deployment on the VPS.
