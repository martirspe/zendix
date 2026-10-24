variable "aws_region" {
  type = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "sender_domain" {
  type        = string
  description = "Verified SES sender domain, e.g. reclamofacil.com"
}

variable "mail_from_subdomain" {
  type    = string
  default = "bounce"
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

variable "campaign_sender_email" {
  type = string
}

variable "account_sender_email" {
  type = string
}

variable "media_domain" {
  type        = string
  description = "Dedicated hostname for public campaign assets, e.g. media.reclamofacil.com"
}

variable "s3_force_destroy" {
  type        = bool
  default     = false
  description = "Allow Terraform to delete a non-empty asset bucket. Keep false in production."
}

variable "manage_account_email_identity" {
  type        = bool
  default     = false
  description = "Manage a separate verified SES identity for account access in this region."
}

variable "dmarc_policy" {
  type    = string
  default = "none"
  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "DMARC policy must be none, quarantine, or reject."
  }
}

variable "domain_ownership_token" {
  type        = string
  sensitive   = true
  description = "Per-tenant MailCraft domain ownership verification token created by the app."
}

locals {
  mail_from_name = "${var.mail_from_subdomain}.${var.sender_domain}"
  media_label    = trimsuffix(trimprefix(var.media_domain, "media."), ".${var.sender_domain}")
  dmarc_value    = "v=DMARC1; p=${var.dmarc_policy}; rua=mailto:dmarc@${var.sender_domain}; adkim=s; aspf=s;"
}
