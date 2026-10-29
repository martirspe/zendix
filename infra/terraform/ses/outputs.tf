output "configuration_set_name" { value = aws_sesv2_configuration_set.campaign.configuration_set_name }
output "events_topic_arn" { value = aws_sns_topic.ses_events.arn }
output "sns_webhook_pending_confirmation" { value = var.enable_webhook_subscription ? aws_sns_topic_subscription.webhook[0].pending_confirmation : true }
output "account_identity_status" { value = aws_sesv2_email_identity.account.verification_status }
output "account_dkim_status" { value = aws_sesv2_email_identity.account.dkim_signing_attributes[0].status }
output "assets_bucket_name" { value = aws_s3_bucket.assets.bucket }
output "assets_distribution_domain" { value = aws_cloudfront_distribution.assets.domain_name }
output "assets_distribution_id" { value = aws_cloudfront_distribution.assets.id }
output "assets_public_base_url" { value = "https://${var.media_domain}" }
output "runtime_iam_user" {
  description = "Create its access key outside Terraform: aws iam create-access-key --user-name <this>."
  value       = aws_iam_user.mailer.name
}

output "server_env" {
  description = "Non-secret runtime settings for Hetzner; set AWS credentials separately."
  value = join("\n", [
    "AWS_REGION=${var.aws_region}",
    "SES_EVENTS_TOPIC_ARN=${aws_sns_topic.ses_events.arn}",
    "SES_CONFIGURATION_SET=${aws_sesv2_configuration_set.campaign.configuration_set_name}",
    "AUTH_EMAIL_SES_REGION=${var.aws_region}",
    "AUTH_EMAIL_SES_CONFIGURATION_SET=${aws_sesv2_configuration_set.campaign.configuration_set_name}",
    "AUTH_EMAIL_FROM_EMAIL=${var.account_sender_email}",
    "AWS_SHARED_CREDENTIALS_FILE=/run/secrets/aws_credentials",
    "ASSETS_S3_BUCKET=${aws_s3_bucket.assets.bucket}",
    "ASSETS_CDN_URL=https://${var.media_domain}"
  ])
}
