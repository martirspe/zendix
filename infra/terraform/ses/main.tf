resource "aws_sesv2_email_identity" "campaign" {
  email_identity = var.sender_domain
  dkim_signing_attributes { next_signing_key_length = "RSA_2048_BIT" }
}

resource "random_id" "asset_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "assets" {
  bucket        = "mailcraft-${var.environment}-assets-${random_id.asset_bucket_suffix.hex}"
  force_destroy = var.s3_force_destroy
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "mailcraft-${var.environment}-assets"
  description                       = "Private S3 access for MailCraft campaign media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "assets" {
  name        = "mailcraft-${var.environment}-immutable-assets"
  min_ttl     = 0
  default_ttl = 31536000
  max_ttl     = 31536000
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

resource "aws_cloudfront_distribution" "assets" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = [var.media_domain]
  price_class     = "PriceClass_100"
  comment         = "MailCraft campaign assets"
  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "mailcraft-assets-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }
  default_cache_behavior {
    target_origin_id       = "mailcraft-assets-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id        = aws_cloudfront_cache_policy.assets.id
    compress               = true
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.assets.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "assets_read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.assets.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket     = aws_s3_bucket.assets.id
  policy     = data.aws_iam_policy_document.assets_read.json
  depends_on = [aws_s3_bucket_public_access_block.assets]
}

resource "aws_acm_certificate" "assets" {
  provider          = aws.us_east_1
  domain_name       = var.media_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "cloudflare_record" "assets_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.assets.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }
  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
  proxied = false
}

resource "aws_acm_certificate_validation" "assets" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.assets.arn
  validation_record_fqdns = [for record in cloudflare_record.assets_certificate_validation : record.hostname]
}

resource "cloudflare_record" "media_cname" {
  zone_id = var.cloudflare_zone_id
  name    = var.media_domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.assets.domain_name
  ttl     = 1
  proxied = false
}

resource "aws_iam_user_policy" "mailer_assets" {
  user = aws_iam_user.mailer.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.assets.arn}/tenants/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.assets.arn
        Condition = {
          StringLike = { "s3:prefix" = ["tenants/*"] }
        }
      }
    ]
  })
}

resource "aws_iam_user_policy" "mailer_cloudfront_invalidation" {
  user = aws_iam_user.mailer.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudfront:CreateInvalidation"]
      Resource = aws_cloudfront_distribution.assets.arn
    }]
  })
}

resource "aws_sesv2_email_identity_mail_from_attributes" "campaign" {
  email_identity         = aws_sesv2_email_identity.campaign.email_identity
  mail_from_domain       = local.mail_from_name
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_sesv2_configuration_set" "campaign" {
  configuration_set_name = "mailcraft-${var.environment}-campaigns"
  reputation_options { reputation_metrics_enabled = true }
  sending_options { sending_enabled = true }
  suppression_options { suppressed_reasons = ["BOUNCE", "COMPLAINT"] }
}

resource "aws_sns_topic" "ses_events" {
  name                              = "mailcraft-${var.environment}-ses-events"
  signature_version                 = "2"
  http_failure_feedback_role_arn    = aws_iam_role.sns_feedback.arn
  http_success_feedback_role_arn    = aws_iam_role.sns_feedback.arn
  http_success_feedback_sample_rate = 10
}

data "aws_iam_policy_document" "sns_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sns_feedback" {
  name               = "mailcraft-${var.environment}-sns-feedback"
  assume_role_policy = data.aws_iam_policy_document.sns_assume.json
}

data "aws_iam_policy_document" "sns_feedback" {
  statement {
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:PutMetricFilter", "logs:PutRetentionPolicy"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sns_feedback" {
  role   = aws_iam_role.sns_feedback.id
  policy = data.aws_iam_policy_document.sns_feedback.json
}

data "aws_iam_policy_document" "sns_topic" {
  statement {
    sid       = "AllowSesConfigurationSetPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ses_events.arn]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_sesv2_configuration_set.campaign.arn]
    }
  }
}
data "aws_caller_identity" "current" {}

resource "aws_sns_topic_policy" "ses_events" {
  arn    = aws_sns_topic.ses_events.arn
  policy = data.aws_iam_policy_document.sns_topic.json
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.campaign.configuration_set_name
  event_destination_name = "signed-sns-events"
  event_destination {
    enabled              = true
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "OPEN", "CLICK"]
    sns_destination { topic_arn = aws_sns_topic.ses_events.arn }
  }
}

resource "aws_sns_topic_subscription" "webhook" {
  topic_arn                       = aws_sns_topic.ses_events.arn
  protocol                        = "https"
  endpoint                        = "${trimsuffix(var.app_public_url, "/")}/webhooks/ses"
  confirmation_timeout_in_minutes = 10
  depends_on                      = [aws_sns_topic_policy.ses_events]
  lifecycle { create_before_destroy = true }
}

resource "aws_sesv2_email_identity" "account" {
  count          = var.manage_account_email_identity ? 1 : 0
  email_identity = var.account_sender_email
}

resource "cloudflare_record" "ownership" {
  zone_id = var.cloudflare_zone_id
  name    = "_mailcraft.${var.sender_domain}"
  type    = "TXT"
  content = "mailcraft-verification=${var.domain_ownership_token}"
  ttl     = 300
}

resource "cloudflare_record" "sender_dkim" {
  for_each = toset(aws_sesv2_email_identity.campaign.dkim_signing_attributes[0].tokens)
  zone_id  = var.cloudflare_zone_id
  name     = "${each.value}._domainkey.${var.sender_domain}"
  type     = "CNAME"
  content  = "${each.value}.dkim.amazonses.com"
  ttl      = 300
  proxied  = false
}

resource "cloudflare_record" "mail_from_spf" {
  zone_id = var.cloudflare_zone_id
  name    = local.mail_from_name
  type    = "TXT"
  content = "v=spf1 include:amazonses.com ~all"
  ttl     = 300
}

resource "cloudflare_record" "mail_from_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = local.mail_from_name
  type     = "MX"
  content  = "feedback-smtp.${var.aws_region}.amazonses.com"
  priority = 10
  ttl      = 300
}

resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.sender_domain}"
  type    = "TXT"
  content = local.dmarc_value
  ttl     = 300
}

resource "cloudflare_record" "dkim" {
  for_each = toset(aws_sesv2_email_identity.campaign.dkim_signing_attributes[0].tokens)
  zone_id  = var.cloudflare_zone_id
  name     = "${each.value}._domainkey.${var.sender_domain}"
  type     = "CNAME"
  content  = "${each.value}.dkim.amazonses.com"
  ttl      = 300
  proxied  = false
}

resource "cloudflare_record" "mail_from_spf" {
  zone_id = var.cloudflare_zone_id
  name    = local.mail_from_name
  type    = "TXT"
  content = "v=spf1 include:amazonses.com ~all"
  ttl     = 300
}

resource "cloudflare_record" "mail_from_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = local.mail_from_name
  type     = "MX"
  content  = "feedback-smtp.${var.aws_region}.amazonses.com"
  priority = 10
  ttl      = 300
}

resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.sender_domain}"
  type    = "TXT"
  content = local.dmarc_value
  ttl     = 300
}

resource "cloudflare_record" "account_dkim" {
  for_each = var.manage_account_email_identity ? toset(aws_sesv2_email_identity.account[0].dkim_signing_attributes[0].tokens) : toset([])
  zone_id  = var.cloudflare_zone_id
  name     = "${each.value}._domainkey.${var.sender_domain}"
  type     = "CNAME"
  content  = "${each.value}.dkim.amazonses.com"
  ttl      = 300
  proxied  = false
}

resource "aws_iam_user" "mailer" {
  name = "mailcraft-${var.environment}-mailer"
}

data "aws_iam_policy_document" "mailer" {
  statement {
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.campaign.arn]
    condition {
      test     = "StringEquals"
      variable = "ses:configuration-set"
      values   = [aws_sesv2_configuration_set.campaign.configuration_set_name]
    }
  }
  statement {
    actions   = ["ses:GetEmailIdentity", "ses:GetAccount", "ses:GetConfigurationSetEventDestinations"]
    resources = ["*"]
  }
  statement {
    actions   = ["sns:ListSubscriptionsByTopic", "sns:ConfirmSubscription"]
    resources = [aws_sns_topic.ses_events.arn]
  }
}

resource "aws_iam_user_policy" "mailer" {
  user   = aws_iam_user.mailer.name
  policy = data.aws_iam_policy_document.mailer.json
}

