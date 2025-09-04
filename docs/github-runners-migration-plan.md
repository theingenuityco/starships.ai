# MVP: Ephemeral Self-Hosted GitHub Runners on AWS

## Goal
Migrate 3 GitHub Actions workflows to ephemeral EC2-based self-hosted runners with minimal complexity.

## Target Workflows
1. **ci-checks.yml** - Node.js CI (lint, type-check, test, build)
2. **discord-pr-sync.yml** - Discord webhook notifications
3. **security.yml** - Security scanning tools

## MVP Architecture (Simplified)

### Core Components
```
GitHub Webhook → API Gateway → Lambda → EC2 Spot Instance → Terminate
```

### What We'll Build (MVP Only)
1. **Single Lambda Function** - Receives webhook, launches EC2
2. **EC2 Spot Instances** - t3.small, Ubuntu 22.04
3. **Simple IAM Role** - EC2 permissions only
4. **Basic Security Group** - Outbound HTTPS only
5. **Default VPC** - Use existing, no custom networking

### What We're NOT Building (Post-MVP)
- Custom VPC/Subnets
- Auto-scaling groups
- CloudWatch dashboards
- Custom AMIs
- Docker caching layers
- Multiple instance types

## Implementation Steps

### Step 1: GitHub App Setup (30 mins)
```bash
# Create GitHub App with permissions:
- Actions: Read
- Administration: Read & Write  
- Metadata: Read

# Webhook events to subscribe:
- Workflow job

# Generate private key and save
```

### Step 2: AWS Lambda Function (1 hour)
```python
# Simple Lambda to handle webhook and launch EC2
import boto3
import json
import base64

def lambda_handler(event, context):
    # Parse GitHub webhook
    body = json.loads(event['body'])
    
    if body['action'] == 'queued':
        # Launch EC2 Spot instance
        ec2 = boto3.client('ec2')
        
        # User data script to install and start runner
        user_data = base64.b64encode(f"""#!/bin/bash
        # Install GitHub runner
        mkdir actions-runner && cd actions-runner
        curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
        tar xzf runner.tar.gz
        
        # Configure runner
        ./config.sh --url {repo_url} --token {runner_token} --ephemeral --unattended
        
        # Install dependencies
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
        npm install -g pnpm
        
        # Start runner
        ./run.sh
        
        # Self-terminate after job
        sudo shutdown -h now
        """.encode()).decode()
        
        response = ec2.run_instances(
            ImageId='ami-0c02fb55731490381',  # Ubuntu 22.04
            InstanceType='t3.small',
            MaxCount=1,
            MinCount=1,
            SpotOptions={'SpotInstanceType': 'one-time'},
            UserData=user_data,
            IamInstanceProfile={'Name': 'github-runner-role'},
            SecurityGroupIds=['sg-github-runners'],
            TagSpecifications=[{
                'ResourceType': 'instance',
                'Tags': [{'Key': 'Name', 'Value': 'github-runner'}]
            }]
        )
    
    return {'statusCode': 200}
```

### Step 3: IAM Role (30 mins)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:DescribeInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:InstanceProfile": "arn:aws:iam::*:instance-profile/github-runner-role"
        }
      }
    }
  ]
}
```

### Step 4: Security Group (15 mins)
```bash
# Outbound only
- HTTPS (443) to 0.0.0.0/0
- HTTP (80) to 0.0.0.0/0  # For apt-get
- No inbound rules
```

### Step 5: Workflow Updates (15 mins)
```yaml
# Before
runs-on: ubuntu-latest

# After  
runs-on: [self-hosted, linux, x64]
```

### Step 6: Runner Registration Token (30 mins)
```bash
# Lambda needs to get runner token via GitHub API
curl -X POST \
  -H "Authorization: Bearer ${GITHUB_APP_TOKEN}" \
  https://api.github.com/repos/OWNER/REPO/actions/runners/registration-token
```

## MVP Testing Plan

### Phase 1: Single Job Test
1. Deploy Lambda and IAM role
2. Create test workflow with simple echo command
3. Verify EC2 launches and terminates

### Phase 2: Real Workflow Test
1. Update ci-checks.yml with one job (lint)
2. Monitor execution and logs
3. Verify job completes and instance terminates

### Phase 3: Full Migration
1. Update all jobs in 3 workflows
2. Run parallel to ubuntu-latest for 1 week
3. Remove ubuntu-latest after validation

## Cost Estimate (MVP)

| Component | Cost/Month |
|-----------|------------|
| EC2 Spot (t3.small) | ~$8-15 |
| Lambda invocations | ~$1 |
| Data transfer | ~$5 |
| **Total** | **~$15-20/month** |

*Based on ~1000 workflow runs/month at ~15 mins per run*

## Success Metrics
- ✅ All 3 workflows running on self-hosted runners
- ✅ Auto-termination working (no orphan instances)  
- ✅ Cost under $50/month
- ✅ No failed jobs due to runner issues

## Timeline
- **Day 1**: GitHub App + AWS setup (2 hours)
- **Day 2**: Lambda deployment + testing (3 hours)
- **Day 3**: Workflow migration + validation (2 hours)
- **Total**: 7 hours of implementation

## Post-MVP Improvements
1. Add CloudWatch monitoring
2. Upgrade to t3.medium for memory-intensive jobs (if needed)
3. Implement runner caching for faster starts
4. Create custom AMI with pre-installed tools
5. Add auto-scaling based on queue depth

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| t3.small runs out of memory | Monitor and upgrade to t3.medium if needed |
| Spot instance unavailable | Job will fail, retry manually (post-MVP: add fallback) |
| Runner fails to terminate | Lambda to check and cleanup every hour |
| Network timeouts | Retry logic in Lambda |
| Security vulnerabilities | Ephemeral instances, no secrets stored |

## Required Secrets/Variables

### GitHub Secrets
```yaml
GITHUB_APP_ID: <app-id>
GITHUB_APP_PRIVATE_KEY: <base64-encoded-key>
```

### AWS Configuration
```yaml
AWS_REGION: us-east-1
RUNNER_SECURITY_GROUP: sg-xxxxxx
RUNNER_IAM_ROLE: github-runner-role
```

## Rollback Plan
If issues arise, simply change workflows back to:
```yaml
runs-on: ubuntu-latest
```
All AWS resources can remain for debugging, costing ~$0 when idle.

---

**Next Steps:**
1. Review and approve this plan
2. Create GitHub App
3. Deploy AWS infrastructure
4. Test with single workflow
5. Migrate all 3 workflows