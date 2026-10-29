variable "aws_region" {
  type = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "platform_domain" {
  type        = string
  description = "Zendix-owned domain used for account access email, e.g. zendix.site"
}

variable "cloudflare_zone_id" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "app_public_url" {
  type        = string
  description = "Public HTTPS origin, e.g. https://app.zendix.site"
}

variable "enable_webhook_subscription" {
  type        = bool
  default     = false
  description = "Create the SES SNS HTTPS subscription only after the public API is healthy."
}

variable "account_sender_email" {
  type = string
}

variable "media_domain" {
  type        = string
  description = "Dedicated Zendix hostname for public campaign assets, e.g. media.zendix.site"
}

variable "s3_force_destroy" {
  type        = bool
  default     = false
  description = "Allow Terraform to delete a non-empty asset bucket. Keep false in production."
}

locals {
  account_sender_domain = split("@", var.account_sender_email)[1]
}
