# AWS EKS Setup Guide for Starships.AI

## Prerequisites Installation

### 1. Install AWS CLI
```bash
# macOS
brew install awscli

# Verify installation
aws --version
```

### 2. Install eksctl
```bash
# macOS
brew tap weaveworks/tap
brew install weaveworks/tap/eksctl

# Verify installation
eksctl version
```

### 3. Install kubectl
```bash
# macOS
brew install kubectl

# Verify installation
kubectl version --client
```

### 4. Install Helm
```bash
# macOS
brew install helm

# Verify installation
helm version
```

## Step-by-Step Setup

### Step 1: Configure AWS CLI
```bash
# Configure AWS credentials
aws configure

# Enter when prompted:
# AWS Access Key ID: [your-access-key]
# AWS Secret Access Key: [your-secret-key]
# Default region name: us-west-2
# Default output format: json
```

### Step 2: Create EKS Cluster
```bash
# Run the quick setup script
cd /Users/prashantp/Desktop/starships.ai
./k8s/scripts/quick-setup-eks.sh starships-cluster us-west-2

# This will take 15-20 minutes and will:
# - Create EKS cluster with 3 nodes
# - Install EBS CSI driver
# - Install AWS Load Balancer Controller
# - Setup GitHub Actions OIDC
```

### Step 3: Save Important Values
After the script completes, it will output:
```
GitHub Actions Role ARN: arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-eks-role
```
**SAVE THIS ARN - You'll need it for GitHub secrets!**

### Step 4: Create ACM Certificate for HTTPS
```bash
# Request a certificate for your domain
aws acm request-certificate \
  --domain-name starships.yourdomain.com \
  --validation-method DNS \
  --region us-west-2

# Note the Certificate ARN that's returned
# Example: arn:aws:acm:us-west-2:123456789:certificate/abc-123-def
```

### Step 5: Configure GitHub Secrets

#### Option A: Using the Helper Script (Recommended)
```bash
cd /Users/prashantp/Desktop/starships.ai
./k8s/scripts/setup-github-secrets.sh

# It will prompt for:
# - AWS_ROLE_TO_ASSUME (use the ARN from Step 3)
# - DOMAIN_NAME (your domain, e.g., starships.example.com)
# - ACM_CERTIFICATE_ARN (from Step 4)
# - NEO4J_PASSWORD
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - STRIPE_PORTAL_ENDPOINT
```

#### Option B: Manual Setup via GitHub UI
1. Go to: https://github.com/theingenuityco/starships.ai/settings/secrets/actions
2. Click "New repository secret" for each:

| Secret Name | Value |
|------------|-------|
| AWS_ROLE_TO_ASSUME | arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-eks-role |
| DOMAIN_NAME | starships.yourdomain.com |
| ACM_CERTIFICATE_ARN | arn:aws:acm:us-west-2:YOUR_ACCOUNT:certificate/YOUR_CERT |
| NEO4J_PASSWORD | your-secure-password |
| OPENAI_API_KEY | sk-... |
| ANTHROPIC_API_KEY | sk-ant-... |
| STRIPE_SECRET_KEY | sk_live_... |
| STRIPE_WEBHOOK_SECRET | whsec_... |
| STRIPE_PORTAL_ENDPOINT | https://billing.stripe.com/p/... |

### Step 6: Update Workflow Configuration
Edit `.github/workflows/deploy-to-eks.yml`:
```yaml
env:
  AWS_REGION: us-west-2  # Your AWS region
  EKS_CLUSTER_NAME: starships-cluster  # Your cluster name
```

### Step 7: Test the Setup

#### Verify EKS Access
```bash
# Update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name starships-cluster

# Check nodes
kubectl get nodes

# Should show 3 nodes in Ready state
```

#### Trigger First Deployment
```bash
# Option 1: Push to main
git add .
git commit -m "Setup EKS deployment"
git push origin main

# Option 2: Manually trigger
gh workflow run deploy-to-eks.yml
```

### Step 8: Monitor Deployment
```bash
# Watch GitHub Actions
gh run watch

# Check pods in EKS
kubectl get pods -n starships-ai -w

# Get load balancer URL
kubectl get ingress -n starships-ai
```

### Step 9: Configure DNS
Once deployment completes:
1. Get the ALB URL:
```bash
kubectl get ingress starships-ingress -n starships-ai -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
# Example output: k8s-starship-starship-abc123.us-west-2.elb.amazonaws.com
```

2. Add CNAME record in your DNS provider:
```
Type: CNAME
Name: starships (or @ for root domain)
Value: k8s-starship-starship-abc123.us-west-2.elb.amazonaws.com
```

## Verification Checklist

- [ ] AWS CLI configured and working
- [ ] EKS cluster created successfully
- [ ] Can run `kubectl get nodes` and see nodes
- [ ] GitHub secrets configured
- [ ] First deployment successful
- [ ] Application accessible via ALB URL
- [ ] DNS configured (optional)

## Troubleshooting

### Cannot connect to cluster
```bash
# Re-update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name starships-cluster
```

### Deployment fails with permissions error
```bash
# Verify role exists
aws iam get-role --role-name github-actions-eks-role

# Check trust relationship
aws iam get-role --role-name github-actions-eks-role --query 'Role.AssumeRolePolicyDocument'
```

### Pods not starting
```bash
# Check pod logs
kubectl logs -n starships-ai -l app=starships-ai

# Describe pods for events
kubectl describe pods -n starships-ai
```

## Cost Estimate
- EKS Cluster: ~$73/month
- 3x t3.large nodes: ~$180/month
- Load Balancer: ~$25/month
- Storage (EBS): ~$10/month
- **Total: ~$288/month**

## Next Commands After Setup

```bash
# View your app
kubectl get ingress -n starships-ai

# Check logs
kubectl logs -f deployment/starships-app -n starships-ai

# Scale manually
kubectl scale deployment/starships-app --replicas=5 -n starships-ai

# Delete cluster (when done testing)
eksctl delete cluster --name starships-cluster --region us-west-2
```