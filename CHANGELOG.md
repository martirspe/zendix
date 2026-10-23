# Changelog

## [Unreleased]
- Add a dedicated Spanish account-access experience with profile-aware registration, terms acceptance, optional one-time-code login, email verification, password recovery and credential-verified workspace selection.
- Add optional Google Identity Services sign-in and registration with server-side signing-key/audience/issuer/email verification, safe verified-email linking, terms-gated signup, tenant-scoped identity and the same workspace picker; keep disabled until configured.
- Add tenant-owned expiring authentication challenges, one-time code verification, password-reset session revocation, per-email and per-IP abuse limits, and a separately mounted MailChannels credential for account emails; preserve duplicate email identities across workspaces.
- Configure optional production authentication email secrets and update the deployment initializer, backup and runbook for account recovery prerequisites.
- Use the same auditable operator/CSV consent record for campaign audience review, test sends and final dispatch; boolean or malformed consent can no longer unlock a mailing.
- Replace SMTP-based test delivery with MailChannels Email API over HTTPS; encrypt API credentials per tenant, configure MailChannels-managed DKIM keys and keep unsubscribe/correlation headers on individual messages.
- Add signed MailChannels webhook verification with replay-age checks, durable idempotent event ingestion, retryable correlation, and bounce/complaint/unsubscribe suppression.
- Add consented audience review, expiring campaign confirmation tokens, current-version preview and sender-DNS gates, durable one-recipient dispatch jobs, and provider-event campaign reconciliation through the MailChannels Email API.
- Add timezone-aware campaign scheduling with revalidation at execution time, stable per-contact A/B subject allocation, required accepted previews for both A/B variants, MailChannels open/click tracking, tenant-scoped campaign analytics and safe cancellation before a scheduled send begins.
- Add isolated end-to-end Email API smoke coverage for campaign confirmation, simulated dispatch, event deduplication and suppression; live public webhook validation and delivery still require operator-owned MailChannels credentials and HTTPS deployment.

- Persist campaign audiences as tenant-owned list associations, validate list ownership on save, and show deduplicated consented eligible-contact counts in campaign review.
- Keep campaign dispatch behind live MailChannels webhook validation, verified sender DNS, consent and current-version preview checks; SMTP does not produce the required MailChannels webhook events.

- Replace long signed browser-view and unsubscribe path tokens with compact, opaque signed links and server-side signature verification to avoid Fastify parameter-length errors.
- Clarify the campaign review's eligible-contact count and preserve the commercial send gate until authenticated provider events, bounce/complaint suppression, audience selection and send confirmation are implemented.

- Disable critical CSS inlining in production so styles load without the inline media-switch script blocked by the console CSP.

- Align deployment command ergonomics with Habix: add `--skip-nginx`/`--skip-tls` workflows, retain the `--skip-host` alias, and document the operator flags while keeping pre-migration backups mandatory.
- Align `DEPLOY.md`, the automatic deployment guide, production runbook and README around the same Habix-style VPS workflow and command names.
- Use `/opt/zendix` as the canonical VPS checkout path in all deployment documentation.
- Report Docker socket permission failures with an actionable group or sudo remediation and document the required VPS user setup.
- Align the canonical VPS workflow with the existing projects: `/opt/zendix`, `sudo ./scripts/deploy.sh`, executable scripts and the `--first-run` alias.
- Make `--skip-tls` a complete DNS-propagation workflow by validating HTTP and deferring the HTTPS check until certificate issuance.
- Remove a broken legacy MailCraft Nginx symlink automatically before validating the renamed Zendix virtual host.
- Remove a broken `zendix` enabled symlink before the first Nginx validation so the bootstrap can create its target.
- Name the host Nginx virtual host exactly `zendix` without a file extension to match the VPS convention.
- Add `DEPLOY.md` with Docker development, automated VPS deployment, Cloudflare/TLS, secrets, backups and post-deployment verification guidance; complete local and production environment examples.
- Replace user-entered workspace identifiers with email/password sign-in, automatic organization creation and a credential-verified organization picker for existing multi-tenant accounts.
- Add inline access errors, browser autocomplete, Enter submission and a guided account-to-connections path; preserve production registration policy.
- Add persisted campaign review checks without enabling commercial dispatch before provider-event and audience safeguards are complete.
- Add VPS initialization/deployment scripts inspired by Habix: shared host Nginx, loopback upstream, retained secrets, backups before migration, health checks, TLS and optional owner bootstrap.
- Add four isolated deployment-orchestration tests and expanded authentication/campaign-review isolation smoke coverage.

- Add the reusable mailcraft-brevo-parity skill and align product instructions with the explicit Brevo interface/functionality cloning objective.
- Specify professional registration/login without user-entered workspace IDs, including safe handling of existing multi-tenant identities.

- Use app.zendix.site for initial public testing and production on one VPS deployment; reserve zendix.site for the commercial website and retain Docker hot reload on localhost.
- Derive console email-link defaults from the configured public origin and validate HTTPS/local development origins.
- Document DNS, HTTPS, sender-domain separation and deployment prerequisites for the provisional domain.

- Add cross-page contact selection (up to 200), atomic bulk archive/unsubscribe/list membership actions and accessible confirmation/result states.
- Add up to 20 tenant-owned saved contact views with filters, column order and page size; preserve view state while refreshing resources.
- Restore workspace name and current role after session refresh; expose read-only contact controls and actionable permission errors.
- Add additive ContactView migration, API isolation/role/validation tests and browser verification using disposable synthetic contacts.

- Complete contact pagination with validated sizes, consistent counts, server search/status/list/archive filters, stable ordering and accessible navigation/loading/error states.
- Add contact editing, reversible archival and suppression-preserving restore; enforce archived-recipient SMTP gates.
- Add list membership CRUD, custom-attribute rename/removal guards, template editing/deletion, draft removal guards and unconfigured domain removal.
- Add native edit/confirmation dialogs, per-tenant column preferences and campaign server pagination; document inspected Brevo references and outstanding parity work.
- Add the nullable Contact.archived_at migration and expanded negative CRUD/tenant/role tests.

- Reuse a visible signed-unsubscribe placeholder in imported templates instead of duplicating the footer; retain fallback for missing, empty, hidden or conditional-only links.
- Restore Brevo mirror links and add purpose-signed, tenant-bound browser views of prepared message snapshots with no-store/noindex and isolated HTML responses.

- Add reusable tenant-scoped HTML mailing templates, file/paste import, code editing and campaign persistence using the existing template table.
- Extend the shared compiler with parsed HTML/CSS sanitization, scoped styles, compatible mobile/VML markup, Brevo variable adaptation and a protected unsubscribe footer.
- Isolate previews with sandbox/CSP and explicit remote-image loading; verify HTML personalization and signed unsubscribe through simulated SMTP.
- Target Node 20 module interoperability on the existing Node 24 Docker runtime for current ESM parsing dependencies.

- Place CSV consent confirmation next to the import action and explain each disabled-button requirement.

- Accept comma, semicolon, tab and pipe CSV exports, UTF-8/UTF-16/Windows-1252, Excel separator hints and up to 50,000 contacts.
- Add per-column mapping, tenant-specific text field creation, batched import progress, duplicate/suppression preservation and paginated contact browsing.
- Add the additive ContactField migration and regression coverage for real-export structure, field ownership and batch import validation.

- Add encrypted tenant-specific SMTP and Cloudflare connections, safe automatic DNS batches, SPF lookup-budget checks and local DKIM signing.
- Add durable operator previews with consent checks, live sender verification, idempotency, uncertain-submission protection and signed unsubscribe confirmation.
- Add rotating refresh sessions, replay detection, server-side logout, role boundaries, Origin checks and Redis-backed authentication limits.
- Add production images, private services, HTTPS gateway configuration, external secret files, owner bootstrap and isolated backup/restore verification.
- Expand verification with mocked Cloudflare, isolated SMTP, session/role isolation and private production-image smoke tests; keep commercial bulk sending disabled.

- Establish the Angular 22 console with Spanish copy, responsive layouts and design tokens.
- Add draft campaigns, sortable visual email blocks, bounded style controls, undo/redo, sandboxed device previews and mandatory unsubscribe HTML output.
- Add account registration/login with asynchronous scrypt password hashing, short-lived JWTs and tenant-scoped API access.
- Connect contact and campaign persistence to PostgreSQL while keeping local demonstration data separate.
- Require and record operator consent; preserve unsubscribe/bounce/complaint states when contacts are imported again.
- Add CSV parsing, column selection, preview, limits and accurate import result reporting.
- Add tenant-specific domain TXT challenges and DNS diagnostics for SPF, DKIM, DMARC, MX and MailChannels Domain Lockdown.
- Validate nested campaign documents and reject cross-tenant queries/mutations.
- Define initial Prisma migration with composite ownership constraints and dispatch/event uniqueness.
- Configure Docker Desktop hot reload, unprivileged processes, reproducible dependency installation, readiness checks and automatic local migrations.
- Resolve audited dependency advisories through pinned compatible transitive overrides and a reproducible lockfile.
- Add focused compiler/CSV/DNS tests and API isolation smoke checks; document incomplete production requirements and keep real delivery disabled.

