terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Default VPC (using existing)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group for Runners
resource "aws_security_group" "github_runner" {
  name        = "github-runner-sg"
  description = "Security group for GitHub self-hosted runners"
  vpc_id      = data.aws_vpc.default.id

  # Outbound rules - allow all
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  # No inbound rules - runners don't need incoming connections

  tags = {
    Name        = "github-runner-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Role for EC2 Instances
resource "aws_iam_role" "github_runner" {
  name = "github-runner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "github-runner-role"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Policy for Runner Instances
resource "aws_iam_role_policy" "github_runner" {
  name = "github-runner-policy"
  role = aws_iam_role.github_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:TerminateInstances"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ec2:InstanceProfile" = aws_iam_instance_profile.github_runner.arn
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "ec2:DescribeVolumes",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      }
    ]
  })
}

# Instance Profile
resource "aws_iam_instance_profile" "github_runner" {
  name = "github-runner-instance-profile"
  role = aws_iam_role.github_runner.name
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "github-runner-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "github-runner-lambda-role"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Lambda IAM Policy
resource "aws_iam_role_policy" "lambda" {
  name = "github-runner-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:RunInstances",
          "ec2:CreateTags",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:RequestSpotInstances",
          "ec2:DescribeSpotInstanceRequests"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:CreateServiceLinkedRole"
        ]
        Resource = "arn:aws:iam::*:role/aws-service-role/spot.amazonaws.com/AWSServiceRoleForEC2Spot"
        Condition = {
          StringLike = {
            "iam:AWSServiceName" = "spot.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = aws_iam_role.github_runner.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/github-runner/*"
      }
    ]
  })
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/github-runner-webhook"
  retention_in_days = 7

  tags = {
    Name        = "github-runner-lambda-logs"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Package Lambda function
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/lambda_function.zip"
}

# Lambda Function
resource "aws_lambda_function" "webhook" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "github-runner-webhook"
  role            = aws_iam_role.lambda.arn
  handler         = "handler.lambda_handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = 60
  memory_size     = 256

  environment {
    variables = {
      GITHUB_APP_ID                  = var.github_app_id
      GITHUB_APP_PRIVATE_KEY_BASE64  = var.github_app_private_key_base64
      GITHUB_WEBHOOK_SECRET           = var.github_webhook_secret
      GITHUB_INSTALLATION_ID          = var.github_installation_id
      RUNNER_SECURITY_GROUP_ID        = aws_security_group.github_runner.id
      RUNNER_INSTANCE_PROFILE_NAME    = aws_iam_instance_profile.github_runner.name
      RUNNER_AMI_ID                   = var.runner_ami_id
      RUNNER_SUBNET_ID               = var.runner_subnet_id != "" ? var.runner_subnet_id : data.aws_subnets.default.ids[0]
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda,
    aws_cloudwatch_log_group.lambda
  ]

  tags = {
    Name        = "github-runner-webhook"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# API Gateway for webhook endpoint
resource "aws_apigatewayv2_api" "webhook" {
  name          = "github-runner-webhook-api"
  protocol_type = "HTTP"
  description   = "API Gateway for GitHub webhook events"

  tags = {
    Name        = "github-runner-webhook-api"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Lambda integration
resource "aws_apigatewayv2_integration" "webhook" {
  api_id           = aws_apigatewayv2_api.webhook.id
  integration_type = "AWS_PROXY"
  
  integration_method = "POST"
  integration_uri    = aws_lambda_function.webhook.invoke_arn
}

# API Gateway route
resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /webhook"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

# API Gateway stage
resource "aws_apigatewayv2_stage" "webhook" {
  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "prod"
  auto_deploy = true

  tags = {
    Name        = "github-runner-webhook-stage"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*"
}

# Lambda function for cleanup (runs hourly)
resource "aws_lambda_function" "cleanup" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "github-runner-cleanup"
  role            = aws_iam_role.lambda.arn
  handler         = "cleanup.lambda_handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = 60
  memory_size     = 128

  environment {
    variables = {
      MAX_INSTANCE_AGE_HOURS = "2"
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda
  ]

  tags = {
    Name        = "github-runner-cleanup"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# EventBridge rule for cleanup
resource "aws_cloudwatch_event_rule" "cleanup" {
  name                = "github-runner-cleanup-schedule"
  description         = "Trigger cleanup of orphaned runner instances"
  schedule_expression = "rate(1 hour)"

  tags = {
    Name        = "github-runner-cleanup-schedule"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# EventBridge target
resource "aws_cloudwatch_event_target" "cleanup" {
  rule      = aws_cloudwatch_event_rule.cleanup.name
  target_id = "github-runner-cleanup"
  arn       = aws_lambda_function.cleanup.arn
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "cleanup" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cleanup.arn
}