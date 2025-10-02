# GitHub Self-Hosted Runners on AWS

Ephemeral self-hosted GitHub Actions runners using AWS Lambda and EC2 Spot instances.

## ✅ Current Status

- **Lambda Functions**: ✅ Deployed and working
- **API Gateway**: ✅ Configured with webhook endpoint
- **GitHub App**: ✅ Created and configured
- **Webhook Integration**: ✅ Connected and receiving events
- **EC2 Launch**: 🔄 Ready for testing

## 📁 Directory Structure

```
github-runners/
├── README.md                    # This file
├── setup-github-app.md          # GitHub App setup instructions
├── DEPLOYMENT.md                # Deployment guide
├── lambda/
│   ├── handler.py              # Webhook handler Lambda
│   ├── cleanup.py              # Cleanup Lambda (hourly)
│   ├── requirements.txt        # Python dependencies
│   └── build.sh                # Build script for Lambda package
└── terraform/
    ├── main.tf                 # Infrastructure configuration
    ├── variables.tf            # Variable definitions
    ├── outputs.tf              # Output values
    └── terraform.tfvars        # Your configuration (git-ignored)
```

## 🚀 Quick Commands

### Update Lambda Function

```bash
cd lambda
./build.sh
cd ../terraform
terraform apply
```

### Check Lambda Logs

```bash
aws logs tail /aws/lambda/github-runner-webhook --follow --region us-east-1
```

### Monitor EC2 Instances

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Type,Values=github-runner" \
  --region us-east-1 \
  --output table
```

## 🔧 Configuration

### Change Instance Type

Edit `lambda/handler.py` line 247:

```python
'InstanceType': 't3.medium',  # Change to t3.medium if needed
```

### Update Runner Version

Edit `lambda/handler.py` line 208:

```bash
RUNNER_VERSION="2.321.0"  # Update to latest version
```

## 📊 Cost Monitoring

Current setup (t3.medium spot instances):

- **Per job**: ~$0.002 (5 min average)
- **Monthly estimate**: $15-20 (1000 jobs)

## ⚠️ Known Issues & TODO

1. **Add monitoring**: CloudWatch dashboard for runner metrics
2. **Add fallback**: On-demand instances when spot unavailable
3. **Optimize startup**: Custom AMI with pre-installed tools
4. **Add caching**: S3 cache for dependencies

## 🔐 Security

- Ephemeral runners (terminate after each job)
- Private subnet with NAT gateway (if needed)
- Minimal IAM permissions
- Webhook signature verification

## 📝 Troubleshooting

### Lambda not receiving webhooks

1. Check webhook URL in GitHub App settings
2. Verify webhook secret matches

### EC2 instances not launching

1. Check Lambda logs for errors
2. Verify IAM permissions
3. Check EC2 service quotas

### Runner not picking up jobs

1. Verify GitHub App installation
2. Check runner registration token
3. Review EC2 user data logs

## 🔄 Next Steps

1. Test with actual PR/push events
2. Monitor first few job runs
3. Adjust instance types based on workload
4. Consider adding monitoring/alerting
