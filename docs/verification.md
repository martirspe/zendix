# Verification — 2026-10-21

The current evidence, release decision and outstanding external checks are recorded in [production-readiness.md](production-readiness.md). Deployment and recovery commands are in [production.md](production.md).

Verification runs in Docker Compose without host dependency installation:

```sh
docker compose exec api npm run build
docker compose exec api npm test
docker compose exec api npm run db:validate
docker compose exec api npm run test:api
docker compose exec -e DATABASE_URL=postgresql://mailcraft:development_only@postgres:5432/mailcraft_smtp_smoke api npm run test:smtp
```

The SMTP smoke database must already exist with all migrations applied. Its transport and DNS responses are simulated; this command never sends external mail. Temporary test data is removed after the checks. The API smoke uses temporary development tenants and requires local registration to be enabled.

Earlier browser checks covered registration, contact consent, persisted drafts, editor preview and domain instructions. The final rotating-session changes are covered by API and production-image checks; a complete browser journey against a public HTTPS deployment remains pending.
