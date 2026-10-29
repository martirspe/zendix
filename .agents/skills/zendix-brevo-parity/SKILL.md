---
name: zendix-brevo-parity
description: Implement and verify Zendix against Brevo for exact interface and functional parity, including professional onboarding and authentication. Use for Zendix parity work, not unrelated applications.
---

# Zendix: Brevo interface and functional parity

## Product directive

Develop Zendix as an exact clone of Brevo in interface design and functionality, using the actual reference screens and workflows as acceptance criteria. A vaguely similar dashboard or a list of decorative controls does not satisfy this objective. Preserve Zendix's own product identity, domains and provider integrations; do not present Zendix as the official Brevo service. Implement original application code using the existing architecture.

Read the repository's AGENTS.md and CONSTITUTION.md first. The user's explicit parity instruction supersedes the older constitution prohibition against cloning. Preserve all tenant, consent, suppression and delivery safeguards. The full Brevo platform is the eventual target; deliver the email-marketing core first, then expand the recorded parity matrix to other modules. Do not silently reduce the target to the current prototype.

## Reference and implementation workflow

Use an explicitly authorized authenticated Brevo browser session as a read-only reference. Inspect only the requested surfaces and avoid copying customer records or delivery metrics. If unavailable, use official public screens/documentation and label visual behavior that cannot be confirmed. Never invent reference observations or treat a paid-plan restriction as evidence that a feature does not exist.

For each implemented journey, compare navigation, hierarchy, typography, spacing, density, tables, controls, dialogs and desktop/mobile behavior. Include loading, empty, error, validation, permission and success states. Match observed design values through CSS/SCSS tokens and existing ds-icon components. Keep visible copy Spanish. Record unavoidable differences explicitly rather than claiming exactness without evidence.

Maintain docs/brevo-parity.md with feature, reference evidence, current implementation, gap, priority and reproducible acceptance criteria. Implement complete vertical slices with persistent backend behavior, ownership checks and working UI controls. Avoid fake analytics, success messages without effects, decorative CRUD buttons and browser storage presented as server persistence.

## Immediate priority: professional account access

Users register and sign in with email and password. Create the initial workspace automatically during registration; do not require users to create it separately or copy a UUID/token to sign in. Keep tenant IDs internal. Registration policy remains environment-controlled; do not enable public production registration merely to simplify local testing.

Existing users and workspaces must remain accessible. The schema currently allows the same email across tenants: do not assume global email uniqueness, select an arbitrary tenant, merge accounts or issue a tenant session before credentials have been verified. Design and test a secure account-resolution/membership flow before changing login. If multiple authorized workspaces remain after identity verification, offer a named workspace picker. Derive resource scope only from verified authentication.

Refresh sessions automatically through the existing protected cookie flow. Never expose access/refresh tokens in user-facing onboarding. Distinguish a technical workspace identifier from a provider credential. Explain account ownership and permissions in plain Spanish. Conexiones must clearly guide signed-out users to account access and signed-in owners to MailChannels configuration. Keep SMTP and Cloudflare secrets in console password fields and encrypted tenant storage, never in chat, URLs or logs.

## Project implementation constraints

Preserve Angular 22 standalone/signals/strict, NestJS/Fastify, Prisma/PostgreSQL and Redis/BullMQ. English code, comments, identifiers and filenames; Spanish UI. No any, Tailwind or Bootstrap. Use Docker Compose with Windows hot reload; do not install host dependencies.

Preserve the shared email compiler and mandatory functional unsubscribe. Keep owned queries and composite relationships tenant-scoped. Do not enable commercial sending while the repository's required delivery safeguards remain incomplete. Schema changes need additive, data-preserving migrations and negative authorization tests.

Use localhost:4200 for local Docker development and app.zendix.site for initial public testing and production on the VPS. Reserve zendix.site for the commercial site. Keep reclamofacil.com as the configured sender unless explicitly changed. Repository work does not by itself authorize external DNS changes, deployment, real email delivery or mutations in Brevo.

## Completion evidence

Update CHANGELOG.md under Unreleased and the parity matrix. Run affected builds and meaningful tests in Docker. For authentication changes, test existing accounts, incorrect passwords, duplicate emails across tenants, workspace selection, role enforcement, refresh/logout and cross-tenant isolation. Verify the actual browser journey with disposable data and inspect screenshots at relevant viewport sizes when available.

Report completed behavior, executed checks, remaining differences and external prerequisites separately. Never claim the complete Brevo clone is finished when only a subset was implemented. Creating this skill defines the work; it does not mean the account flow or the full parity objective has already shipped.
