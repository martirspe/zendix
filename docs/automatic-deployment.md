# Automated VPS deployment

The operator runs these commands on the VPS. Repository preparation does not deploy the application or modify Cloudflare. This workflow adapts the deploy/build/backup/host-ingress pattern inspected in gohabix/scripts/deploy.sh to MailCraft's stack. It does not import Habix credentials, domains, databases or volumes.

## Target and requirements

- Console and initial real-world tests: https://app.zendix.site.
- Cloudflare A record: app -> 178.104.132.74. Keep the root zendix.site reserved for the commercial website. Publish AAAA only with working IPv6.
- Linux VPS with Bash, Docker Engine, Compose v2, OpenSSL, curl, tar and sudo/root access for host Nginx. Docker is a prerequisite; the scripts do not run remote Docker-install scripts.
- TCP 80/443 reachable. An existing host Nginx may continue serving Habix and other applications. MailCraft uses a separate virtual host and loopback port 8092 by default. A VPS with another ingress implementation requires a manual integration review.
- During first certificate issuance, DNS-only records simplify diagnosis. With Cloudflare proxying afterward, use Full (strict). Do not cache authentication, unsubscribe or browser-view routes.

## First deployment

Upload or clone the project, enter its directory and run:

```bash
sudo mkdir -p /opt/zendix
sudo chown "$USER:$USER" /opt/zendix
cd /opt/zendix
git clone https://github.com/martirspe/zendix.git .
chmod +x scripts/*.sh
sudo ./scripts/deploy.sh --first-run
sudo ./scripts/deploy.sh --check
sudo ./scripts/deploy.sh --bootstrap-owner
sudo ./scripts/deploy.sh --pull
```

This uses the same `/opt/zendix` and `sudo ./scripts/deploy.sh` convention as
the other applications on the VPS. `--first-run` creates the production
configuration; `--init` remains a compatible alias.

Initialization asks for the certificate-notice email, creates .env.production and generates missing production secrets only for a completely new secret set. It never replaces existing secrets. An incomplete secret set aborts and must be recovered from its matching backup. Keep the environment file private. Default generated secret files are readable by their mounted non-root containers, inside an operator-only 0700 directory; do not loosen directory permissions or commit the files.

Preflight checks Docker, Compose, hostname/port/email configuration and expected non-empty secret paths without starting services. The automation supports the default secret paths under deploy/secrets. Custom existing layouts must use the manual runbook. Environment values are read as simple unquoted scalar entries; the file is never executed as shell code.

Deployment builds images sequentially, runs unit and orchestration tests in Docker, checks non-root secret mount access, starts private PostgreSQL/Redis and creates a pre-migration backup. It then runs reviewed migrations and waits for API/static-server health. Owner bootstrap asks for organization name, email and a hidden password twice; credentials pass through standard input rather than arguments/environment variables. The console then accepts email/password login without a technical identifier. Public registration remains disabled.

Host setup installs Nginx/Certbot packages from OS repositories if missing on a Debian/Ubuntu host, creates only the application's virtual host, validates Nginx before reload and obtains/retains the TLS certificate through Certbot. It does not disable other sites, replace global Nginx settings or change firewall policy. Certificate issuance accepts the certificate provider terms when the operator runs this command; review those terms before deployment. Repeated deployments preserve the Certbot-managed configuration. A hostname already managed elsewhere stops setup for manual review. Changing WEB_PORT later requires updating the existing app vhost consistently.

The final command verifies the public HTTPS health URL. DNS propagation, firewall restrictions or certificate errors cause failure instead of a false readiness message. Inspect the failed step and retry after correction; data and secrets are retained. Running this workflow still does not prove email delivery or commercial release readiness.

## Updates and private mode

```bash
sudo ./scripts/deploy.sh
# Only for a clean Git checkout with a configured upstream:
sudo ./scripts/deploy.sh --pull
# Build/start the private stack without changing host Nginx or certificates:
sudo ./scripts/deploy.sh --skip-nginx
# Configure host Nginx but defer certificate issuance:
sudo ./scripts/deploy.sh --skip-tls
```

--pull refuses a dirty checkout and uses fast-forward only. --skip-nginx verifies the loopback stack, not public HTTPS. --skip-tls configures the host virtual host while deferring certificate issuance. No command resets a database or deletes persistent volumes. There is no automatic application downgrade after a migration failure; retain backups and follow a schema-compatible recovery plan.

When `--skip-tls` is used, the script checks the HTTP route only. After the
Cloudflare A record has propagated, rerun `sudo ./scripts/deploy.sh` without
`--skip-tls` so Certbot can complete the certificate challenge.

Equivalent Compose commands for inspection:

```bash
docker compose --env-file .env.production -p mailcraft-production -f compose.production.yaml -f compose.host-proxy.yaml ps
docker compose --env-file .env.production -p mailcraft-production -f compose.production.yaml -f compose.host-proxy.yaml logs --tail 100 api web
```

This override disables the Caddy gateway by default and binds only the static/proxy server to 127.0.0.1:8092. Do not enable the standalone gateway profile when host Nginx owns 80/443. Host Nginx overwrites forwarded client headers; the private container proxy preserves them for API rate limiting.

## Backups and recovery

Each deployment saves a PostgreSQL custom-format dump, private environment file and secret archive under a new private backups/pre-deploy-* directory before migrations. Even a first deployment takes an empty database backup. A failed build or backup prevents migrations. These local copies contain secrets: create encrypted off-host backups and configure retention/monitoring. Do not share their contents in chat.

Restore PostgreSQL only into an isolated empty database first. Recover the matching vault secret and AWS credentials with it. Do not change database/Redis passwords for existing volumes by rerunning initialization. The manual production runbook describes restore constraints. The automation's local orchestration tests simulate commands; they do not validate public TLS, OS package installation, firewall rules or a live VPS restore.

## Before the first real email

Log in, connect Amazon SES in Conexiones and configure the sender through Dominios. The sender remains noreply@reclamofacil.com unless intentionally changed. Use https://app.zendix.site as the stored public link origin. Add the authorized preview recipient with consent, save/import the design, click Guardar y revisar and resolve the pending checks before requesting an individual preview. Confirm received Authentication-Results and functional opt-out/browser links.

Commercial campaigns require a verified SES identity, confirmed signed SNS subscription, sender DNS, consented audience, accepted current preview and explicit confirmation. Do not interpret SES acceptance as inbox delivery.

## Local verification evidence

The deployment orchestration tests cover preflight and backup ordering. Current SES verification includes strict builds, unit tests and an isolated database smoke with simulated transport; a public AWS delivery and SNS callback still require operator configuration.
