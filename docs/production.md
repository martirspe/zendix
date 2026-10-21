# Production runbook

## Scope

This runbook deploys the authenticated console and controlled operator-preview workflow. It does not enable commercial bulk campaigns. No live deployment or real MailChannels delivery has been performed by the automated checks.

## Prepare

Choose the application hostname and hosting server. The email sender domain can be different from the application hostname. Point only the chosen application hostname to the server, and make ports 80/443 available for the HTTPS gateway. This is separate from the SPF/DKIM/DMARC changes made through the console.

Run `./scripts/prepare-production.ps1` once to generate new secrets without displaying them. It refuses to overwrite existing files and restricts the directory ACL on Windows. For an existing deployment, retain its original secrets instead of generating replacements. Move secrets to the target host through an approved encrypted channel with restrictive filesystem permissions; do not commit them.

Copy `.env.production.example` to `.env.production` and configure APP_HOST, ACME_EMAIL and secret file paths. The file references secrets; SMTP/Cloudflare customer credentials belong in the console. JWT and vault secret files are required in production. No development credential fallback is accepted. Production registration is disabled.

## Build and initialize

```sh
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d postgres redis migrate
```

Create `deploy/secrets/bootstrap.json` with `workspace`, `email` and a new `password` of at least 16 characters. Keep this file private. Create the first owner without enabling public registration:

```powershell
Get-Content deploy/secrets/bootstrap.json -Raw | docker compose --env-file .env.production -f compose.production.yaml run --rm -T migrate node scripts/production-entry.mjs scripts/create-owner.mjs
```

The command confirms owner creation without printing a technical workspace identifier. Sign in with the configured email and password. Remove the temporary bootstrap file after securely retaining the credentials. The command creates a new owner and refuses to overwrite an existing workspace owner.

## Deploy after checks

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d
docker compose --env-file .env.production -f compose.production.yaml ps
```

The gateway is the only service publishing ports. PostgreSQL, Redis, API and static server remain private. The API uses one trusted reverse-proxy hop; the gateway controls forwarded client headers. Caddy obtains certificates for the configured public application hostname. The private local smoke test does not issue or validate a public certificate.

## Before accepting users

Verify HTTPS and the login/refresh/logout journey on the real hostname. Connect MailChannels and a zone-scoped Cloudflare token from the console. Confirm DNS propagation and run an explicitly requested individual preview. Review the actual received message's Authentication-Results and DKIM/SPF/DMARC alignment. Acceptance by SMTP is insufficient evidence of inbox delivery.

Set the SMTP connection's public unsubscribe URL to the application origin. Production rejects other origins. Verify GET only displays confirmation, POST registers the opt-out and subsequent previews are suppressed. Check the signed one-click headers on the received message.

Monitor `/api/health`, container restarts and queued/failed/uncertain preview states. Do not automatically retry uncertain SMTP submissions. Configure hosting-specific alert delivery and backups only after selecting the deployment environment.

## Backups and recovery

Retain encrypted off-host copies of PostgreSQL dumps, the vault secret, all tenant DKIM keys and deployment configuration. Protect copies of JWT/database/Redis secrets according to the deployment's recovery policy. A database dump without the matching vault key cannot recover encrypted provider credentials. A missing DKIM key cannot sign with the already-published DNS key.

Take a PostgreSQL custom-format dump before migrations. Restore into an isolated empty database, run migration checks and verify credential decryption with the matching key before replacing a live database. `scripts/test-restore.ps1` demonstrates this with synthetic local fixtures; it is not an off-host backup scheduler.

The new migrations are additive. Roll back application images only to a version compatible with the current schema. Do not delete volumes or reset a shared database to roll back. Preserve uncertain SMTP states during recovery so a restore does not replay submissions.

## Local production-image verification

The private smoke uses `.env.production.example` with newly generated local secrets and no published gateway:

```powershell
docker compose --env-file .env.production.example -f compose.production.yaml up -d --no-build api web
Get-Content scripts/production-smoke.mjs -Raw | docker compose --env-file .env.production.example -f compose.production.yaml exec -T api node --input-type=module
docker compose --env-file .env.production.example -f compose.production.yaml run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.production.example -f compose.production.yaml stop
```

This test uses a temporary synthetic owner and verifies production configuration, private readiness, Origin rejection, Secure/HttpOnly/SameSite cookies and server-side logout revocation. It does not expose a listener, modify external DNS or send an email.

## Provisional domain

The selected application hostname is `app.zendix.site` for initial public testing and production on the same VPS deployment. The root domain is reserved for the commercial website. See [Zendix domain setup](zendix-domain.md) for Cloudflare records, local Docker behavior, sender-domain separation and activation checks. APP_HOST is configured in the environment examples. Set a real ACME_EMAIL before starting the public gateway.

## Automated shared-host deployment

The preferred operator workflow is now [automatic-deployment.md](automatic-deployment.md), with host Nginx and a private port 8092 so other VPS applications can coexist. The standalone Caddy commands above remain an alternative for a dedicated ingress. Do not start both gateways on public ports.
