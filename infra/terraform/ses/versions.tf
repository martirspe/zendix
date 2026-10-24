terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws        = { source = "hashicorp/aws", version = "~> 6.0" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
    random     = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Application = "MailCraft", ManagedBy = "Terraform", Environment = var.environment } }
}

provider "cloudflare" { api_token = var.cloudflare_api_token }

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
