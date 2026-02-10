variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "runner_region_pool" {
  description = "Comma-separated list of AWS regions to try for launching runner instances (defaults to aws_region)"
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
  sensitive   = true
}

variable "github_app_private_key_base64" {
  description = "Base64 encoded GitHub App private key"
  type        = string
  sensitive   = true
}

variable "github_webhook_secret" {
  description = "Secret for validating GitHub webhooks"
  type        = string
  sensitive   = true
}

variable "github_installation_id" {
  description = "GitHub App installation ID"
  type        = string
  sensitive   = true
}

variable "runner_ami_ssm_param_x64" {
  description = "SSM parameter name for x64 Ubuntu AMI ID (defaults to Canonical 24.04 stable current)"
  type        = string
  default     = ""
}

variable "runner_ami_ssm_param_arm64" {
  description = "SSM parameter name for arm64 Ubuntu AMI ID (defaults to Canonical 24.04 stable current)"
  type        = string
  default     = ""
}

variable "runner_ami_id_x64" {
  description = "AMI ID for x64 runner instances (single-region only; multi-region deployments should use SSM parameters)"
  type        = string
  default     = ""
}

variable "runner_ami_id_arm64" {
  description = "AMI ID for arm64 runner instances (single-region only; multi-region deployments should use SSM parameters)"
  type        = string
  default     = ""
}

variable "runner_subnet_id" {
  description = "Subnet ID for runner instances (optional, uses default VPC if not specified)"
  type        = string
  default     = ""
}

variable "runner_instance_type" {
  description = "Instance type for runners"
  type        = string
  default     = "t3.medium"
}

variable "lambda_cryptography_layer" {
  description = "ARN of Lambda layer for cryptography library (required for JWT signing)"
  type        = string
  default     = ""
}