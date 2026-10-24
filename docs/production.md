# Production runbook

The supported production workflow is the Habix-style shared-host deployment
described in [DEPLOY.md](../DEPLOY.md) and
[automatic-deployment.md](automatic-deployment.md). It uses Docker Compose for
the application, a loopback web port (`8092` by default), and a dedicated host
Nginx virtual host for `app.zendix.site`.

## Standard operator flow

```bash
sudo mkdir -p /opt/zendix
sudo chown "$USER:$USER" /opt/zendix
git clone https://github.com/martirspe/zendix.git /opt/zendix
cd /opt/zendix
chmod +x scripts/*.sh
sudo ./scripts/deploy.sh --first-run
sudo ./scripts/deploy.sh --check
sudo ./scripts/deploy.sh --bootstrap-owner
sudo ./scripts/deploy.sh --pull
```

The deployment command builds the images, runs tests, starts PostgreSQL and Redis,
creates the pre-migration backup, applies migrations, starts the API and web
services, configures the host virtual host and requests TLS. For updates use
`sudo ./scripts/deploy.sh --pull` from a clean checkout.

The same command names are used for controlled variants:

```bash
sudo ./scripts/deploy.sh --skip-nginx
sudo ./scripts/deploy.sh --skip-tls
```

`--skip-nginx` validates the private Docker stack without changing host
ingress. `--skip-tls` configures Nginx but defers certificate issuance. The
legacy `--skip-host` spelling remains accepted as an alias for `--skip-nginx`.

## Local production-image verification

Use Docker only; do not install dependencies on the host. The following
commands build and inspect the production images without publishing the public
gateway:

```powershell
docker compose --env-file .env.production.example -f compose.production.yaml build
docker compose --env-file .env.production.example -f compose.production.yaml run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

The automated deployment tests run in the migrate image and verify preflight,
secret retention, backup-before-migration ordering and failure stops. They do
not issue a public certificate, modify Cloudflare or send email.

## Production invariants

- Keep the generated secret files and scoped AWS credentials with the database backup.
- Never delete volumes or reset a shared database to roll back.
- Backups are mandatory before migrations; the deployment has no bypass flag.
- Configure Amazon SES and Cloudflare from the authenticated console.
- Commercial campaigns remain gated on verified SES events, sender DNS,
  consent, an accepted current preview and explicit confirmation.

See [DEPLOY.md](../DEPLOY.md) for configuration, backups, recovery and the
post-deployment verification checklist.

Optional AWS media and email infrastructure is managed separately from the
Hetzner VPS using [the SES/S3/CloudFront Terraform stack](../infra/terraform/ses/README.md).
It does not provision Route 53 or replace Cloudflare DNS.
