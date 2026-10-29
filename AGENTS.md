# Zendix engineering instructions

Read CONSTITUTION.md before changing product code. It is the product's governing specification.

- Code, identifiers, comments, schema and filenames must be English; visible UI copy must be Spanish.
- Preserve Angular 22 standalone/signals/strict mode, NestJS/Fastify, Prisma/PostgreSQL and Redis/BullMQ architecture.
- Use Docker Compose for development and verification. Keep hot reload enabled on Windows. Do not run host dependency installation.
- Use the shared email compiler. The unsubscribe footer must never be removable in the editor.
- Tenant context must come from verified authentication. Include tenant_id in owned database records and every resource query. Preserve composite ownership constraints.
- Never display synthetic delivery statistics as real data. Keep prototype browser storage explicitly labeled.
- Never enable sending until authentication, consent/suppression, verified sender DNS, durable queue semantics, signed unsubscribe and provider event verification are implemented and tested.
- Use CSS/SCSS design tokens. No Tailwind or Bootstrap. Use @lucide/angular through ds-icon.
- Update CHANGELOG.md under [Unreleased] and run affected builds and tests.

For Zendix interface/functionality parity and professional account-access work, apply `.agents/skills/zendix-brevo-parity/SKILL.md`. The current user directive targets exact Brevo design and functional parity, with evidence and the security invariants above preserved.
