# Deployment Instructions

## Prerequisites

1. **AWS CLI** installed and configured with appropriate credentials
2. **Terraform** >= 1.0 installed
3. **GitHub App** created (follow `setup-github-app.md`)
4. **Python 3.11** (for local testing)

## Step 1: Configure GitHub App

1. Follow the instructions in `setup-github-app.md`
2. Save all the required values (App ID, Installation ID, private key, webhook secret)

## Step 2: Prepare Terraform Variables

1. Navigate to the terraform directory:
```bash
cd github-runners/terraform
```

2. Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```

3. Edit `terraform.tfvars` with your values:
```hcl
aws_region = "us-east-1"
environment = "prod"

github_app_id = "YOUR_APP_ID"
github_app_private_key_base64 = "YOUR_BASE64_KEY"
github_webhook_secret = "YOUR_WEBHOOK_SECRET"
github_installation_id = "YOUR_INSTALLATION_ID"
```

To encode your private key:
```bash
base64 -i /path/to/github-app-private-key.pem | tr -d '\n'
```

## Step 3: Deploy AWS Infrastructure

1. Initialize Terraform:
```bash
terraform init
```

2. Review the plan:
```bash
terraform plan
```

3. Apply the configuration:
```bash
terraform apply
```

4. Note the webhook URL from the output:
```
webhook_url = "https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod/webhook"
```

## Step 4: Update GitHub App Webhook

1. Go to your GitHub App settings
2. Update the **Webhook URL** with the URL from Terraform output
3. Save the changes

## Step 5: Test the Setup

### Test with a Simple Workflow

1. Create a test workflow file `.github/workflows/test-runner.yml`:
```yaml
name: Test Self-Hosted Runner

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: [self-hosted, linux, x64]
    steps:
      - name: Check runner
        run: |
          echo "Running on self-hosted runner"
          echo "Hostname: $(hostname)"
          echo "OS: $(uname -a)"
          echo "Node version: $(node --version)"
          echo "NPM version: $(npm --version)"
```

2. Go to Actions tab and manually trigger this workflow
3. Monitor the Lambda logs in CloudWatch
4. Verify EC2 instance launches and terminates

## Step 6: Migrate Workflows

### Option A: Gradual Migration (Recommended)

1. Copy the self-hosted workflow files to your `.github/workflows/` directory:
```bash
cp github-runners/workflows/*-selfhosted.yml .github/workflows/
```

2. These will run in parallel with existing workflows
3. Monitor for 1-2 days
4. Once stable, remove the original workflows

### Option B: Direct Migration

1. Update existing workflows directly:
```bash
# In each workflow file, change:
runs-on: ubuntu-latest
# To:
runs-on: [self-hosted, linux, x64]
```

## Step 7: Monitoring

### CloudWatch Logs
- Lambda function logs: `/aws/lambda/github-runner-webhook`
- View in AWS Console or via CLI:
```bash
aws logs tail /aws/lambda/github-runner-webhook --follow
```

### EC2 Instances
Monitor running instances:
```bash
aws ec2 describe-instances \
  --filters "Name=tag:Type,Values=github-runner" \
  --query "Reservations[].Instances[?State.Name=='running'].[InstanceId,LaunchTime,Tags[?Key=='JobId'].Value|[0]]" \
  --output table
```

### Cost Monitoring
Check daily costs:
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter file://cost-filter.json
```

## Troubleshooting

### Issue: Webhook not received
- Check GitHub App webhook settings
- Verify webhook secret matches
- Check API Gateway logs

### Issue: EC2 instance fails to launch
- Check Lambda logs for errors
- Verify IAM permissions
- Check EC2 quotas/limits
- Ensure security group exists

### Issue: Runner doesn't pick up job
- Check EC2 user data logs: `/var/log/runner-setup.log`
- SSH into instance (if you add SSH key)
- Verify GitHub App permissions

### Issue: Instance doesn't terminate
- Check cleanup Lambda function
- Manually terminate via:
```bash
aws ec2 terminate-instances --instance-ids i-xxxxx
```

### Issue: Spot instance unavailable
- Job will fail, retry manually
- Consider adding fallback to on-demand (post-MVP)

## Rollback

If issues arise, immediately rollback:

1. In each workflow, change back:
```yaml
runs-on: [self-hosted, linux, x64]
# Back to:
runs-on: ubuntu-latest
```

2. Infrastructure can remain deployed (costs $0 when idle)

## Cleanup (if needed)

To completely remove the infrastructure:
```bash
cd github-runners/terraform
terraform destroy
```

## Support

For issues:
1. Check Lambda logs first
2. Review EC2 instance status
3. Verify GitHub App configuration
4. Check this troubleshooting guide