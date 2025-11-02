# GitHub Self-Hosted Runners - Usage Guide

## Overview

This setup uses AWS Lambda and EC2 Spot instances to automatically provision ephemeral GitHub runners on-demand. Runners are created when jobs are queued and self-terminate after completion.

## Basic Usage

### Default Instance Type (t3.medium)

```yaml
jobs:
  my-job:
    runs-on: [self-hosted, linux, x64]
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running on t3.medium (default)"
```

## Specifying Instance Types

### Using Custom Instance Types

Add the instance type as a label in the `runs-on` field:

```yaml
jobs:
  light-job:
    name: Light Lint Job
    runs-on: [self-hosted, linux, x64, t3.small]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run lint

  standard-job:
    name: Standard Build
    runs-on: [self-hosted, linux, x64, t3.medium]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run build

  heavy-job:
    name: Heavy Build Job
    runs-on: [self-hosted, linux, x64, t3.large]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run build

  memory-intensive:
    name: Memory Intensive Job
    runs-on: [self-hosted, linux, x64, r5.xlarge]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run test:integration

  compute-intensive:
    name: Compute Intensive Job
    runs-on: [self-hosted, linux, x64, c5.2xlarge]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run benchmark
```

## How It Works

1. **Workflow triggered**: GitHub sends a webhook to the Lambda function
2. **Label parsing**: Lambda extracts instance type from the job labels
3. **Instance launch**: EC2 Spot instance is launched with the specified type
4. **Runner registration**: Instance registers as an ephemeral GitHub runner
5. **Job execution**: Runner picks up and executes the job
6. **Auto-cleanup**: Instance self-terminates after job completion

## Instance Type Selection Logic

- The Lambda function scans labels for any containing a dot (`.`)
- First matching label is used as the instance type (e.g., `t3.large`, `c5.xlarge`)
- If no instance type label is found, defaults to `t3.medium`
- Any valid AWS instance type can be specified

## Supported Instance Types

You can use any AWS EC2 instance type available in your region. Common examples:

### General Purpose (T3/T3a)
- `t3.nano`, `t3.micro`, `t3.small`, `t3.medium`, `t3.large`, `t3.xlarge`, `t3.2xlarge`

### Compute Optimized (C5/C6i)
- `c5.large`, `c5.xlarge`, `c5.2xlarge`, `c5.4xlarge`
- `c6i.large`, `c6i.xlarge`, `c6i.2xlarge`

### Memory Optimized (R5/R6i)
- `r5.large`, `r5.xlarge`, `r5.2xlarge`, `r5.4xlarge`
- `r6i.large`, `r6i.xlarge`, `r6i.2xlarge`

### General Purpose (M5/M6i)
- `m5.large`, `m5.xlarge`, `m5.2xlarge`, `m5.4xlarge`
- `m6i.large`, `m6i.xlarge`, `m6i.2xlarge`

## Cost Optimization Tips

1. **Use smaller instances for simple jobs**: Linting, type checking → `t3.small`
2. **Use default for standard builds**: Most builds work well on `t3.medium`
3. **Scale up only when needed**: Large builds, tests → `t3.large` or `t3.xlarge`
4. **Spot instances**: All runners use Spot pricing (up to 90% savings)
5. **Ephemeral runners**: Instances terminate immediately after job completion

## Current Workflow Examples

### CI Checks (`.github/workflows/ci-checks.yml`)

Currently uses default `t3.medium` for all jobs. Can be optimized:

```yaml
jobs:
  lint:
    runs-on: [self-hosted, linux, x64, t3.small]  # Lint is lightweight

  type-check:
    runs-on: [self-hosted, linux, x64, t3.small]  # Type check is lightweight

  test:
    runs-on: [self-hosted, linux, x64, t3.medium]  # Tests need moderate resources

  build:
    runs-on: [self-hosted, linux, x64, t3.large]  # Build is resource-intensive
```

## Monitoring

### Check running instances

```bash
aws ec2 describe-instances \
  --region us-east-1 \
  --filters "Name=tag:Type,Values=github-runner" "Name=instance-state-name,Values=running,pending" \
  --query "Reservations[].Instances[].[InstanceId,InstanceType,State.Name,LaunchTime,Tags[?Key=='JobId'].Value|[0]]" \
  --output table
```

### Check Lambda logs

```bash
aws logs tail /aws/lambda/github-runner-webhook --region us-east-1 --since 10m --follow
```

## Troubleshooting

### Job stuck in queued state
- Check Lambda function logs for errors
- Verify webhook is configured correctly in GitHub
- Check EC2 instance launch permissions

### Instance type not working
- Ensure instance type is available in your region
- Check Spot capacity availability
- Verify IAM permissions for EC2 instance types

### Cost concerns
- Monitor instance usage in AWS Cost Explorer
- Set up billing alerts
- Review job requirements and downsize where possible

## Deployment

After updating the Lambda handler, redeploy:

```bash
cd github-runners/lambda
./build.sh
cd ../terraform
terraform apply
```
