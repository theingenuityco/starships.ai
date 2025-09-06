output "webhook_url" {
  description = "URL for GitHub webhook"
  value       = "${aws_apigatewayv2_stage.webhook.invoke_url}/webhook"
}

output "security_group_id" {
  description = "Security group ID for runners"
  value       = aws_security_group.github_runner.id
}

output "instance_profile_name" {
  description = "Instance profile name for runners"
  value       = aws_iam_instance_profile.github_runner.name
}

output "lambda_function_name" {
  description = "Name of the webhook Lambda function"
  value       = aws_lambda_function.webhook.function_name
}

output "cleanup_function_name" {
  description = "Name of the cleanup Lambda function"
  value       = aws_lambda_function.cleanup.function_name
}

output "api_gateway_id" {
  description = "API Gateway ID"
  value       = aws_apigatewayv2_api.webhook.id
}

output "default_vpc_id" {
  description = "VPC ID being used"
  value       = data.aws_vpc.default.id
}

output "subnet_id" {
  description = "Subnet ID being used for runners"
  value       = var.runner_subnet_id != "" ? var.runner_subnet_id : data.aws_subnets.default.ids[0]
}