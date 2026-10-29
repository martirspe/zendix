# Amazon SES setup for Zendix

Zendix sends campaign mail with SES v2. The Terraform stack in `infra/terraform/ses` provisions shared account suppression, configuration set, SNS event topic, scoped runtime IAM, the platform account-email identity and the private asset CDN. Review its README and plan before applying. It does not request SES production access, which AWS must approve, and cannot verify public delivery or inbox placement.

1. Request SES production access for the chosen region; Terraform cannot approve this account-level request.
2. After the public app is deployed, apply Terraform using only Zendix platform DNS values. Tenant sender domains and Cloudflare credentials do not belong in Terraform.
3. Confirm the SNS HTTPS subscription is no longer pending. Zendix validates the SNS v2 signature, certificate URL, timestamp and exact topic before confirming it. Set the Terraform outputs as `AWS_REGION`, `SES_CONFIGURATION_SET` and `SES_EVENTS_TOPIC_ARN` on the server.
4. Store the Terraform campaign IAM credentials in the server secret store only; do not use them in the browser. Configure separate credentials and a verified sender identity for account-access mail.
5. In **Dominios**, an authenticated owner adds the sender domain and proves control with the tenant-specific TXT record. Zendix then creates its SES identity and custom MAIL FROM and exposes manual DNS records or installs them with an encrypted, zone-scoped Cloudflare token. In **Conexiones**, select the verified sender and authorized test recipient; tenants never enter AWS credentials, region, configuration set or webhook URLs.

The sender domain, DKIM, custom MAIL FROM, consented recipient, signed unsubscribe, verified event pipeline and accepted current preview are rechecked before a commercial campaign. Each message has a tenant and dispatch tag for event correlation. An uncertain SES response is never retried automatically. SES acceptance is not reported as delivery.

Account-access mail uses `AUTH_EMAIL_SES_REGION`, `AUTH_EMAIL_SES_CONFIGURATION_SET`, `AUTH_EMAIL_FROM_EMAIL`, and `AUTH_EMAIL_AWS_PROFILE`. Configure that named AWS profile with a separate IAM principal and verified identity. It does not share campaign configuration or credentials. Leave the values empty until account mail is ready.

The historical `mailchannels` database enum value and old migration remain for existing records. New dispatches use `ses`; no active request path or dependency calls the retired provider. The deployment script stops the old worker before migration. Unfinished legacy dispatches become `failed`, except in-flight submissions whose outcome is unknown (`uncertain`); affected scheduled/sending campaigns become `failed`. Back up the database before migration. Recovery requires the matching database backup and an explicit operator decision on any uncertain sends.
