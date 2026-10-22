# MailCraft

Angular 22, NestJS/Fastify, PostgreSQL, Prisma, Redis/BullMQ and MailChannels SMTP. CONSTITUTION.md and AGENTS.md govern changes.

## Development

Run `docker compose up --build -d` and open http://localhost:4200. Source mounts and polling provide hot reload on Docker Desktop. PostgreSQL/Redis are private; console/API ports bind to loopback. Application processes run as `node`.

```sh
docker compose exec api npm run build
docker compose exec api npm test
docker compose exec api npm run test:api
docker compose exec api npm audit
```

The migrations service applies reviewed additive migrations before the API starts. Dependency installation uses the lockfile inside Docker. Never delete database or key volumes to refresh dependencies.

## Test an email from the console

1. Create/sign into a workspace. Registration creates the initial organization automatically. Sign in with email/password; choose a named organization only if credentials match several existing accounts. Sessions use an in-memory access token plus a rotating HttpOnly refresh cookie; reloading resumes the session. Logout revokes server-side sessions.
2. Open **Conexiones**. Enter the Account ID, assigned SMTP username/password, sender, authorized test recipient and application URL. Connection verification uses mandatory STARTTLS and does not send a message. Credentials are encrypted per tenant and never returned to the UI.
3. Open **Dominios**. The sender domain is added after SMTP connection. Enter a Cloudflare API token with Zone:Read and DNS:Edit scoped to that zone, then choose **Conectar y configurar Cloudflare**.
4. MailCraft detects the active zone, generates a persistent RSA DKIM key and configures ownership TXT, SPF, DKIM, DMARC and Domain Lockdown. Existing MX and valid DMARC policies are preserved. SPF is extended rather than duplicated; nested reference lookup limits are checked before modifying it. Conflicts stop the batch. Repeating setup is idempotent. This is a console API-token integration, not a Cloudflare OAuth popup.
5. Add the authorized recipient under **Contactos** with consent. Save a design and use **Enviar correo de prueba** in the editor. The worker rechecks DNS ownership and authentication records, the matching DKIM key and current subscription before submitting to SMTP.

An accepted SMTP message is displayed as **Aceptado por SMTP**, never as delivered. A lost acknowledgement becomes **Resultado incierto** and is not retried automatically. Check MailChannels logs before explicitly starting another test. The queue contains tenant/resource IDs; PostgreSQL stores the durable request, design snapshot and idempotency key.

Signed unsubscribe links show a confirmation on GET and unsubscribe on POST; GET prefetching never changes subscription. HTTPS origins receive List-Unsubscribe-Post one-click headers. Localhost links are useful only on the machine running MailCraft and cannot support Gmail's server-side one-click requests. Production requires the configured public HTTPS application origin.

## Verification

- Unit tests cover HTML/text/style safety, mandatory opt-out, CSV parsing, credential encryption/AAD, DNS planning, mocked Cloudflare batch operations, SPF lookup budgets, unsubscribe signatures and SMTP failure classification.
- `test:api` uses temporary synthetic tenants to verify auth, refresh replay protection, logout revocation, roles, input validation, tenant isolation and suppression preservation.
- SMTP integration smoke tests require the dedicated `mailcraft_smtp_smoke` database. After migrating it, run `docker compose exec -e DATABASE_URL=postgresql://mailcraft:development_only@postgres:5432/mailcraft_smtp_smoke api npm run test:smtp`. The SMTP transport is simulated; no external message is sent.
- `scripts/test-restore.ps1` verifies PostgreSQL dump/restore and credential decryption using two exclusively generated temporary databases, then removes those databases.
- Production images are verified separately with `scripts/production-smoke.mjs`; see the production runbook.

## Production

Read [DEPLOY.md](DEPLOY.md), [docs/automatic-deployment.md](docs/automatic-deployment.md) and `docs/production-readiness.md`. The production Compose file uses compiled Node code, static Nginx, required secrets, restricted containers, private data services, persistent encrypted credentials/DKIM keys, health checks and automatic migrations. It has no source mounts or development servers. Public registration is disabled by default; an operator can create an owner through `scripts/deploy.sh --bootstrap-owner`.

Back up PostgreSQL together with the matching vault secret and DKIM key volume. Losing the encryption key makes stored credentials unrecoverable. Base image digests are pinned; dependency/image updates require rebuilding and revalidation.

## Product boundaries

Implemented: HTML mailing import/reusable templates with code editing, responsive Spanish console, tenant accounts, owner/editor/viewer enforcement, persisted contacts/drafts, consent recording, CSV separator detection, per-column mapping/custom text fields and batched import, six sortable email blocks, bounded style controls, undo/redo, sandboxed previews, HTML export, Cloudflare DNS setup and individual SMTP previews.

Commercial bulk campaigning remains disabled. Required expansion includes provider-verified delivery/bounce/complaint ingestion, transactional suppression handling for campaign dispatch, lists/segments, complete review/audience/schedule/A-B flows, tracking/analytics, full block library/VML, email confirmation/double opt-in and complete cross-client QA. SSR/hydration, Satoshi font licensing/assets and commercial operations also remain. Successful operator previews do not establish full SaaS production readiness.


HTML template workflow and compatibility limits: [docs/html-templates.md](docs/html-templates.md).


Core CRUD evidence: [docs/core-crud.md](docs/core-crud.md). Brevo parity status: [docs/brevo-parity.md](docs/brevo-parity.md).


## Provisional application domain

Initial public testing and production share `app.zendix.site` on the VPS. The root `zendix.site` is reserved for the commercial website. Local development remains at `http://localhost:4200` with hot reload. See [domain and Cloudflare setup](docs/zendix-domain.md).

## Automated VPS deployment

Use [DEPLOY.md](DEPLOY.md) and the [automatic deployment guide](docs/automatic-deployment.md) for `bash scripts/deploy.sh --init`, preflight and deployment on `app.zendix.site`. The command names and operator flags follow the Habix deployment workflow.
