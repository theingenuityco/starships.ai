# Per-starship EC2 box (Graviton). One `terraform apply` per starship.
# Sized for peak build load (native code execution runs the tenant's test suite),
# not idle. Provisioning/teardown is intentionally left to an operator.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "starship_slug" {
  type        = string
  description = "Unique slug; used for naming and the subdomain (<slug>.starships.ai)."
}

variable "instance_type" {
  type    = string
  default = "t4g.large" # Graviton, 2 vCPU / 8 GiB; bump for heavier test suites.
}

variable "ami_id" {
  type        = string
  description = "Base AMI (Ubuntu arm64) with cloud-init support."
}

variable "key_name" {
  type        = string
  description = "EC2 key pair name for SSH."
}

variable "subnet_id" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "root_volume_gb" {
  type    = number
  default = 100
}

provider "aws" {
  region = var.region
}

resource "aws_security_group" "starship" {
  name        = "starship-${var.starship_slug}"
  description = "Starship box: HTTP/HTTPS in, all out."
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "starship-${var.starship_slug}" }
}

resource "aws_instance" "starship" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.starship.id]
  user_data              = file("${path.module}/cloud-init.yaml")

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = "starship-${var.starship_slug}", Starship = var.starship_slug }
}

# Daily EBS snapshots of the root volume for durability.
resource "aws_dlm_lifecycle_policy" "starship_snapshots" {
  description        = "starship-${var.starship_slug} daily snapshots"
  execution_role_arn = var.dlm_role_arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Starship = var.starship_slug }

    schedule {
      name = "daily"
      create_rule { interval = 24, interval_unit = "HOURS", times = ["03:00"] }
      retain_rule { count = 7 }
    }
  }
}

variable "dlm_role_arn" {
  type        = string
  description = "IAM role ARN for the Data Lifecycle Manager."
}

output "public_ip" {
  value = aws_instance.starship.public_ip
}

output "subdomain" {
  value = "${var.starship_slug}.starships.ai"
}
