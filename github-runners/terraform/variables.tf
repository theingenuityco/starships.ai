variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
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

variable "runner_ami_id" {
  description = "AMI ID for runner instances (defaults to Ubuntu 22.04 LTS)"
  type        = string
  default     = ""  # Will be set based on region in main.tf
}

variable "runner_ami_id_x64" {
  description = "AMI ID for x64 runner instances (optional; defaults to runner_ami_id)"
  type        = string
  default     = ""
}

variable "runner_ami_id_arm64" {
  description = "AMI ID for arm64 runner instances (required if you want [self-hosted, linux, arm64] runners)"
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