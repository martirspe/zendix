# Zendix AWS services on Hetzner

The existing VPS continues to run the application, PostgreSQL and Redis/BullMQ.
This Terraform stack provisions SES campaign delivery, SNS events, a private S3
asset bucket, CloudFront with Origin Access Control, ACM TLS in `us-east-1`,
and Cloudflare records. It does not create Hetzner or Route 53 infrastructure.

## Prerequisites and state

Deploy `https://<app-host>/webhooks/ses` before enabling the SNS subscription.
Keep `enable_webhook_subscription = false` while the public API is unhealthy,
then set it to `true` and apply again after the health check passes. The
production stack uses the private, encrypted, versioned
S3 backend `zendix-terraform-state-496620607923` with native lock files. Never commit state, real variable files, provider tokens,
or credentials. Authenticate AWS with a named profile or federation. Scope the
Cloudflare API token to read the target zone and edit its DNS records.

Copy `terraform.tfvars.example` to an ignored `production.tfvars` file and set
only Zendix platform values. The Cloudflare zone and token belong to
`zendix.site` and are used for the private asset CDN and account-email DKIM.
Customer sender domains and their DNS credentials never belong in Terraform;
authenticated tenant owners add and verify them from the Zendix console.

## Apply

```powershell
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=production.tfvars -out=production.tfplan
terraform apply production.tfplan
```

After apply, create the access key manually outside Terraform. This keeps the
one-time secret out of Terraform state, following the VendedorIA pattern:

```bash
terraform output -raw runtime_iam_user
aws iam create-access-key --user-name "$(terraform output -raw runtime_iam_user)"
```

AWS returns the secret access key only once. Store the returned AccessKeyId and
SecretAccessKey directly in `deploy/secrets/aws_credentials` on the VPS:

```ini
[default]
aws_access_key_id=REPLACE_WITH_ACCESS_KEY_ID
aws_secret_access_key=REPLACE_WITH_SECRET_ACCESS_KEY
```

Set file permissions to `600`; never paste the secret into chat, commit it, or
print it in deployment logs. Retrieve non-secret runtime variables with
`terraform output -raw server_env`.

SES production access remains an AWS account approval and is not granted by
Terraform. Terraform creates only the scoped campaign IAM user and its policies;
the key stays outside Terraform state. Grant the runtime only this bucket's
`tenants/*` prefix and the managed sender/configuration set. Configure the
resulting region, topic ARN, configuration-set name and asset bucket/domain in
the production secret environment. Never expose AWS credentials in the browser.

The CloudFront certificate is issued in `us-east-1`, while its DNS validation
and media hostname records are created in the existing Cloudflare zone. The
media CNAME is DNS-only in Cloudflare; CloudFront serves HTTPS with OAC access
to the private bucket. Use unique object keys so the one-year cache remains
correct when assets are replaced.

Terraform manages only the Zendix account-email identity. The API creates a
separate SES identity and custom MAIL FROM for each tenant-owned domain after
the tenant proves DNS ownership, then exposes manual records or installs them
with that tenant's encrypted, zone-scoped Cloudflare token.

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
