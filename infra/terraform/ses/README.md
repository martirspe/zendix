# MailCraft AWS services on Hetzner

The existing VPS continues to run the application, PostgreSQL and Redis/BullMQ.
This Terraform stack provisions SES campaign delivery, SNS events, a private S3
asset bucket, CloudFront with Origin Access Control, ACM TLS in `us-east-1`,
and Cloudflare records. It does not create Hetzner or Route 53 infrastructure.

## Prerequisites and state

Deploy `https://<app-host>/webhooks/ses` before applying so SNS can confirm its
HTTPS subscription. Use an encrypted remote Terraform state backend with strict
access and versioning. Never commit state, real variable files, provider tokens,
or credentials. Authenticate AWS with a named profile or federation. Scope the
Cloudflare API token to read the target zone and edit its DNS records.

Copy `terraform.tfvars.example` to an ignored `production.tfvars` file and set
real values. `domain_ownership_token` must match MailCraft's existing DNS proof
for the sender domain. Review SPF and DMARC at the DNS provider before applying;
the module intentionally cannot merge conflicting policies. The DMARC example
uses monitoring policy `none`; move to quarantine or reject after evaluating
reports for every legitimate sender using the domain.

## Apply

```powershell
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=production.tfvars -out=production.tfplan
terraform apply production.tfplan
```

SES production access remains an AWS account approval and is not granted by
Terraform. Use the generated scoped campaign IAM user with credentials stored
only on the VPS in a restrictive secret file; prefer short-lived federation if
configured for the host. Grant the runtime only this bucket's
`tenants/*` prefix and the managed sender/configuration set. Configure the
resulting region, topic ARN, configuration-set name and asset bucket/domain in
the production secret environment. Never expose AWS credentials in the browser.

The CloudFront certificate is issued in `us-east-1`, while its DNS validation
and media hostname records are created in the existing Cloudflare zone. The
media CNAME is DNS-only in Cloudflare; CloudFront serves HTTPS with OAC access
to the private bucket. Use unique object keys so the one-year cache remains
correct when assets are replaced.

The campaign sender and account sender currently share the same SES domain
identity and DKIM. For per-tenant sender domains, provision an identity and DNS
records per verified domain; do not reuse one global ownership token.

## Remaining commercial and application gates

1. Obtain SES production access and verify SES reports identity, DKIM, MAIL FROM
   and suppression are ready.
2. Wait for ACM certificate issuance and Cloudflare record propagation. Verify
   the SNS subscription is confirmed after the live app acknowledges it.
3. The repository does not yet implement the S3 upload API, presigned upload
   URLs, tenant-scoped asset metadata, file type/size validation, or editor image
   picker. Those application changes are required before console uploads work.
4. Deliver an authorized preview. Verify signed event ingestion, delivery,
   controlled bounce/complaint suppression, unsubscribe and image rendering in
   common email clients. Confirm account-access SES separately if registration
   verification or recovery is enabled.

Terraform provisions infrastructure; it does not prove inbox placement or
commercial readiness. Do not enable campaign sends until the release gates and
the project's consent, suppression, queue and authentication checks pass.
