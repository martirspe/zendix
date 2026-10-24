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

Terraform automation for SES and Cloudflare DNS is available in `infra/terraform/ses`. It provisions the account resources, but its apply is not proof of production access, DNS propagation, webhook receipt, or live deliverability.

1. Deploy app.zendix.site on the chosen VPS and validate public HTTPS, off-host backups and alert delivery there.
2. Configure SES identity, Easy DKIM, custom MAIL FROM, account suppression and a configuration set with an SNS destination as described in [SES setup](ses-setup.md). Enter the region and sender in the authenticated console; AWS credentials remain on the server. Verify DNS and receipt of the authorized preview.
3. Deploy `/webhooks/ses` over public HTTPS and confirm the SNS subscription. The endpoint verifies SNS signature version 2, certificate URL, timestamp and exact topic before accepting an event; PostgreSQL deduplicates and queues it before acknowledgment. Verify bounce and complaint suppression with a controlled live test.
4. Campaign confirmation revalidates the SNS subscription and checks the current audience, consent, accepted preview and DNS. Local tests do not send external campaigns. The SES identity and SNS topic must be configured by an operator before live mail.
5. Campaign scheduling, A/B subject allocation and event-backed analytics are implemented and covered by isolated Docker smoke checks. Verify SES open/click tracking and downstream inbox rendering publicly before relying on these reports. Automatic winner selection and a second send remain outstanding.
6. Configure a separate `AUTH_EMAIL_AWS_PROFILE`, `AUTH_EMAIL_SES_REGION`, `AUTH_EMAIL_SES_CONFIGURATION_SET` and verified `AUTH_EMAIL_FROM_EMAIL` before relying on account email verification or recovery. Public registration remains disabled by default.

## Operator test case

The requested case is an individual preview from `noreply@reclamofacil.com` to `rosonoem@gmail.com`, with Cloudflare managing the sender domain. Those values are local development defaults only; they are not embedded in the public production JavaScript bundle. A zone-scoped Cloudflare API token is needed to install DNS records from the console.




## Current deployment automation

See automatic-deployment.md for the Habix-style shared-host flow. Four isolated orchestration tests cover preflight, retained secrets, backup-before-migration ordering and aborts on failed build/backup. Authentication no longer requires a pasted workspace UUID. The editor review reports actual saved prerequisites; it does not enable commercial campaigns. Public Nginx/Certbot/firewall behavior remains unverified until the operator runs deployment on the VPS.
