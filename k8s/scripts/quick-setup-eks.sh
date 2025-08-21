#!/bin/bash
# Quick setup script for AWS EKS cluster and GitHub Actions integration

set -e

# Configuration
CLUSTER_NAME=${1:-starships-cluster}
REGION=${2:-us-west-2}
NODE_TYPE=${3:-t3.large}
GITHUB_ORG="theingenuityco"
GITHUB_REPO="starships.ai"

echo "🚀 Quick EKS Setup for Starships.AI"
echo "===================================="
echo "Cluster: $CLUSTER_NAME"
echo "Region: $REGION"
echo "Node Type: $NODE_TYPE"
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 not found. Please install it first."
        exit 1
    fi
}

echo "Checking prerequisites..."
check_command aws
check_command eksctl
check_command kubectl
check_command helm
echo "✅ All prerequisites installed"
echo ""

# Create EKS cluster
echo "Creating EKS cluster..."
eksctl create cluster \
  --name $CLUSTER_NAME \
  --region $REGION \
  --nodegroup-name starships-nodes \
  --node-type $NODE_TYPE \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key ~/.ssh/id_rsa.pub \
  --alb-ingress-access

echo "✅ EKS cluster created"
echo ""

# Install EBS CSI Driver
echo "Installing EBS CSI Driver..."
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster $CLUSTER_NAME \
  --region $REGION \
  --service-account-role-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/AmazonEKS_EBS_CSI_DriverRole \
  --force

echo "✅ EBS CSI Driver installed"
echo ""

# Install AWS Load Balancer Controller
echo "Installing AWS Load Balancer Controller..."

# Create IAM policy for ALB controller
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.4/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json 2>/dev/null || true

# Create service account
eksctl create iamserviceaccount \
  --cluster=$CLUSTER_NAME \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --region=$REGION \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --approve

# Install cert-manager
kubectl apply \
  --validate=false \
  -f https://github.com/jetstack/cert-manager/releases/download/v1.5.4/cert-manager.yaml

# Wait for cert-manager
echo "Waiting for cert-manager..."
kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-webhook -n cert-manager

# Install ALB controller
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

echo "✅ AWS Load Balancer Controller installed"
echo ""

# Setup GitHub Actions OIDC
echo "Setting up GitHub Actions OIDC..."

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OIDC_PROVIDER=$(aws eks describe-cluster --name $CLUSTER_NAME --region $REGION --query "cluster.identity.oidc.issuer" --output text | sed -e "s/^https:\/\///")

# Create OIDC provider if not exists
aws iam list-open-id-connect-providers | grep $OIDC_PROVIDER > /dev/null 2>&1
if [ $? -ne 0 ]; then
    eksctl utils associate-iam-oidc-provider --cluster $CLUSTER_NAME --region $REGION --approve
fi

# Create IAM role for GitHub Actions
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
        },
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name github-actions-eks-role \
  --assume-role-policy-document file://trust-policy.json 2>/dev/null || true

# Attach policies
aws iam attach-role-policy \
  --role-name github-actions-eks-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

aws iam attach-role-policy \
  --role-name github-actions-eks-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy

# Create inline policy for kubectl access
cat > eks-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "eks:DescribeCluster",
                "eks:ListClusters"
            ],
            "Resource": "*"
        }
    ]
}
EOF

aws iam put-role-policy \
  --role-name github-actions-eks-role \
  --policy-name eks-describe-policy \
  --policy-document file://eks-policy.json

# Update aws-auth ConfigMap to allow the role to access the cluster
eksctl create iamidentitymapping \
  --cluster $CLUSTER_NAME \
  --region $REGION \
  --arn arn:aws:iam::${ACCOUNT_ID}:role/github-actions-eks-role \
  --group system:masters \
  --username github-actions

echo "✅ GitHub Actions OIDC setup complete"
echo ""

# Output important information
echo "========================================="
echo "🎉 EKS Cluster Setup Complete!"
echo "========================================="
echo ""
echo "Cluster Name: $CLUSTER_NAME"
echo "Region: $REGION"
echo "GitHub Actions Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/github-actions-eks-role"
echo ""
echo "Next Steps:"
echo "1. Update .github/workflows/deploy-to-eks.yml with:"
echo "   - AWS_REGION: $REGION"
echo "   - EKS_CLUSTER_NAME: $CLUSTER_NAME"
echo ""
echo "2. Set GitHub Secrets:"
echo "   AWS_ROLE_TO_ASSUME: arn:aws:iam::${ACCOUNT_ID}:role/github-actions-eks-role"
echo "   Run: ./k8s/scripts/setup-github-secrets.sh"
echo ""
echo "3. Create ACM certificate for your domain:"
echo "   aws acm request-certificate --domain-name your-domain.com --validation-method DNS"
echo ""
echo "4. Push to main branch to trigger deployment!"
echo ""
echo "Useful commands:"
echo "  kubectl get nodes"
echo "  kubectl get pods -A"
echo "  eksctl get cluster --name $CLUSTER_NAME --region $REGION"

# Cleanup temp files
rm -f iam_policy.json trust-policy.json eks-policy.json