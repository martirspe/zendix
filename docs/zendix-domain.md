# Zendix provisional application domain

The provisional application origin is https://app.zendix.site for initial public testing and production on the same VPS deployment. The root zendix.site is reserved for the commercial website. MailCraft remains the product name until the final brand is chosen. Hostnames are runtime configuration, not compiled frontend constants.

## Environments

| Environment | Browser and public links | Configuration |
| --- | --- | --- |
| Local hot reload | http://localhost:4200 | compose.yaml and .env |
| VPS: initial testing, then production | https://app.zendix.site | compose.production.yaml and .env.production |

Local development keeps Windows polling and loopback-only listeners. Copy .env.example only for a new setup; preserve existing credentials. The optional APP_PUBLIC_URL overrides the default public email-link origin. Do not set it to a hostname until that hostname actually routes to this installation. Angular proxies /api, /unsubscribe and /email-view to the API, so localhost links use port 4200 consistently.

## Cloudflare and VPS activation

In the zendix.site zone, create an A record for app pointing to the operator-provided VPS IPv4 address `178.104.132.74`. The root domain does not need to point to this deployment. Publish AAAA only if the VPS has working IPv6 routing. Do not modify MX, SPF, DKIM or DMARC merely to publish the application. Remove conflicting address records for these application names deliberately, after reviewing their existing use.

Caddy in compose.production.yaml terminates HTTPS and routes the console, API, signed browser views and unsubscribe endpoints on the same origin. Keep TCP 80 and 443 reachable at the VPS firewall. During initial certificate issuance, DNS-only records simplify diagnosis. If Cloudflare proxying is enabled afterward, use Full (strict) encryption. Do not use Flexible mode or cache /api/*, /unsubscribe/* or /email-view/*. Retain no-store responses and bypass caching for authenticated traffic. These are deployment instructions; no DNS changes or certificate issuance were performed by editing this repository.

Copy .env.production.example to .env.production on the VPS. APP_HOST is already app.zendix.site. Replace ACME_EMAIL with a monitored operator mailbox; the example address is a placeholder. Generate and protect new production secrets using scripts/prepare-production.ps1 only for a new deployment. Follow docs/production.md for builds, migrations, owner bootstrap and startup. Existing installations must retain their original secrets and data.

Initial public testing uses this same production deployment and origin, with production security settings and public registration disabled. No separate dev hostname or second gateway is required. Use disposable consented contacts for tests; local development remains separate. Do not publish the Angular hot-reload server as the public application.

## Email sender and existing connections

The application domain does not replace the sender domain. The existing sender remains noreply@reclamofacil.com and the explicitly authorized preview recipient remains rosonoem@gmail.com. Amazon SES sender DNS is configured separately through Dominios. zendix.site needs sender SPF/DKIM/DMARC only if it will also send email.

After the public deployment works, configure Amazon SES from Conexiones with https://app.zendix.site so new signed links use the correct host. Existing message snapshots remain immutable; do not rewrite links in already prepared previews.

## Verification before a public preview

Verify /api/health, authentication/refresh/logout, a prepared /email-view link and the unsubscribe confirmation on the chosen HTTPS origin. Confirm the production cookie is Secure and HTTP does not serve authenticated content. Test opt-out with a disposable consented contact. Real SES delivery and public DNS/TLS still require the actual VPS deployment and IAM configuration. Bulk commercial sending remains gated by the project's delivery requirements.

## Repository verification

Angular and Nest builds, 23 unit tests, API smoke tests and production Compose environment validation passed. Local /auth/config returns http://localhost:4200. Public deployment, TLS issuance and real email delivery remain pending operator access and ingress review.

The preferred automatic deployment uses host Nginx/Certbot and compose.host-proxy.yaml, as described in automatic-deployment.md. The standalone Caddy instructions above are an alternative, not an additional gateway.
