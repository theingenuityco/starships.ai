# AWS EKS Implementation Guide

## 🎯 Step-by-Step Migration Implementation

This guide provides detailed, actionable steps to migrate from DigitalOcean to AWS EKS. Follow each phase sequentially.

## 📋 Prerequisites Checklist

### AWS Account Setup
- [ ] AWS account created and verified
- [ ] $5000+ credits applied to account
- [ ] Root account secured with MFA
- [ ] Billing alerts configured ($100, $200, $300)
- [ ] Cost Explorer enabled

### Local Development Setup
- [ ] AWS CLI installed and configured
- [ ] Terraform installed (v1.0+)
- [ ] kubectl installed
- [ ] Git access to starships.ai repository
- [ ] Branch `feature/aws-eks-migration` created

### Domain & DNS Prerequisites
- [ ] Access to Namecheap account for starships.ai
- [ ] Current DNS settings documented
- [ ] Backup of current DNS configuration

## 🚀 Phase 1: Foundation Setup (Week 1)

### Day 1-2: AWS Account Configuration

#### Step 1: Secure AWS Account
```bash
# 1. Enable MFA on root account (AWS Console)
# 2. Create IAM admin user (not root)
# 3. Configure AWS CLI with admin user

aws configure
# Access Key ID: [Your IAM user access key]
# Secret Access Key: [Your IAM user secret key]
# Default region: ap-south-1
# Output format: json

# Verify setup
aws sts get-caller-identity
aws ec2 describe-regions --region ap-south-1
```

#### Step 2: Set Up Terraform Backend
```bash
# Create unique S3 bucket for Terraform state
BUCKET_SUFFIX=$(date +%s)
BUCKET_NAME="starships-terraform-state-${BUCKET_SUFFIX}"

aws s3 mb s3://${BUCKET_NAME} --region ap-south-1
aws s3api put-bucket-versioning \
    --bucket ${BUCKET_NAME} \
    --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
    --table-name terraform-state-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region ap-south-1

# Store bucket name for later use
echo "export TF_STATE_BUCKET=${BUCKET_NAME}" >> ~/.bashrc
source ~/.bashrc
```

#### Step 3: Create Terraform Directory Structure
```bash
# Create terraform directory in your project
cd /path/to/starships.ai
mkdir -p terraform/{environments/{dev,prod},modules/{vpc,eks,rds,dns},shared}

# Update backend configuration with your bucket
cat > terraform/shared/backend.tf << EOF
terraform {
  required_version = ">= 1.0"
  
  backend "s3" {
    bucket         = "${TF_STATE_BUCKET}"
    key            = "environments/ENV/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}
EOF
```

### Day 3-5: VPC and Networking

#### Step 4: Create VPC Module
```bash
# Create VPC module
cat > terraform/modules/vpc/main.tf << 'EOF'
# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "starships-${var.environment}-vpc"
    "kubernetes.io/cluster/starships-${var.environment}" = "shared"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = {
    Name = "starships-${var.environment}-igw"
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count = length(var.availability_zones)
  
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  
  tags = {
    Name = "starships-${var.environment}-public-${count.index + 1}"
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/starships-${var.environment}" = "shared"
  }
}

# Private Subnets
resource "aws_subnet" "private" {
  count = length(var.availability_zones)
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  
  tags = {
    Name = "starships-${var.environment}-private-${count.index + 1}"
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/starships-${var.environment}" = "shared"
  }
}

# NAT Gateways
resource "aws_eip" "nat" {
  count = var.single_nat_gateway ? 1 : length(var.availability_zones)
  domain = "vpc"
  
  tags = {
    Name = "starships-${var.environment}-nat-eip-${count.index + 1}"
  }
  
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : length(var.availability_zones)
  
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = {
    Name = "starships-${var.environment}-nat-${count.index + 1}"
  }
  
  depends_on = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = {
    Name = "starships-${var.environment}-public-rt"
  }
}

resource "aws_route_table" "private" {
  count = length(var.availability_zones)
  
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  }
  
  tags = {
    Name = "starships-${var.environment}-private-rt-${count.index + 1}"
  }
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count = length(var.availability_zones)
  
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(var.availability_zones)
  
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
EOF

# Create VPC variables
cat > terraform/modules/vpc/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "Use single NAT gateway for cost optimization"
  type        = bool
  default     = false
}
EOF

# Create VPC outputs
cat > terraform/modules/vpc/outputs.tf << 'EOF'
output "vpc_id" {
  value = aws_vpc.main.id
}

output "vpc_cidr_block" {
  value = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  value = aws_internet_gateway.main.id
}

output "nat_gateway_ids" {
  value = aws_nat_gateway.main[*].id
}
EOF
```

#### Step 5: Deploy Dev Environment Infrastructure
```bash
# Create dev environment configuration
cat > terraform/environments/dev/main.tf << 'EOF'
terraform {
  backend "s3" {
    key = "environments/dev/terraform.tfstate"
  }
}

module "vpc" {
  source = "../../modules/vpc"
  
  environment = var.environment
  vpc_cidr    = "10.1.0.0/16"
  
  availability_zones = ["ap-south-1a", "ap-south-1b"]
  
  public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_subnet_cidrs = ["10.1.10.0/24", "10.1.20.0/24"]
  
  single_nat_gateway = true  # Cost optimization for dev
}

# EKS module will be added in next step
EOF

# Create dev variables
cat > terraform/environments/dev/variables.tf << 'EOF'
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}
EOF

# Create dev terraform.tfvars
cat > terraform/environments/dev/terraform.tfvars << 'EOF'
aws_region = "ap-south-1"
environment = "dev"
domain_name = "starships.ai"
EOF

# Initialize and deploy VPC
cd terraform/environments/dev

# Update backend config with your bucket
sed -i.bak "s/starships-terraform-state-TIMESTAMP/${TF_STATE_BUCKET}/g" ../../shared/backend.tf

terraform init
terraform plan
terraform apply
```

### Day 6-7: EKS Cluster Setup

#### Step 6: Create EKS Module
```bash
# Create EKS module
cat > terraform/modules/eks/main.tf << 'EOF'
# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.cluster_version
  
  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }
  
  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
    aws_cloudwatch_log_group.cluster,
  ]
  
  tags = {
    Name = var.cluster_name
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = 7
}

# EKS Node Groups
resource "aws_eks_node_group" "main" {
  for_each = var.node_groups
  
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = each.key
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.subnet_ids
  
  capacity_type  = each.value.capacity_type
  instance_types = each.value.instance_types
  
  scaling_config {
    desired_size = each.value.desired_size
    max_size     = each.value.max_size
    min_size     = each.value.min_size
  }
  
  update_config {
    max_unavailable = 1
  }
  
  depends_on = [
    aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.node_AmazonEC2ContainerRegistryReadOnly,
  ]
  
  tags = {
    Name = "${var.cluster_name}-${each.key}"
  }
}

# IAM Role for EKS Cluster
resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# IAM Role for EKS Node Group
resource "aws_iam_role" "node" {
  name = "${var.cluster_name}-node-role"
  
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
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEC2ContainerRegistryReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node.name
}

# Security Group for additional access to EKS
resource "aws_security_group" "cluster_additional" {
  name_prefix = "${var.cluster_name}-additional"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.cluster_name}-additional"
  }
}
EOF

# Create EKS variables and outputs
cat > terraform/modules/eks/variables.tf << 'EOF'
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs"
  type        = list(string)
}

variable "node_groups" {
  description = "EKS node groups configuration"
  type = map(object({
    instance_types = list(string)
    capacity_type  = string
    min_size      = number
    max_size      = number
    desired_size  = number
  }))
}
EOF

cat > terraform/modules/eks/outputs.tf << 'EOF'
output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_security_group_id" {
  value = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

output "node_security_group_id" {
  value = aws_eks_node_group.main["main"].node_group_arn
}

output "cluster_arn" {
  value = aws_eks_cluster.main.arn
}
EOF
```

#### Step 7: Deploy EKS to Dev Environment
```bash
# Update dev main.tf to include EKS
cat >> terraform/environments/dev/main.tf << 'EOF'

module "eks" {
  source = "../../modules/eks"
  
  cluster_name    = "starships-${var.environment}"
  cluster_version = "1.28"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  
  node_groups = {
    main = {
      instance_types = ["t3.medium"]
      capacity_type  = "SPOT"
      min_size      = 1
      max_size      = 3
      desired_size  = 2
    }
  }
}
EOF

# Deploy EKS
terraform plan
terraform apply

# Configure kubectl
aws eks update-kubeconfig --region ap-south-1 --name starships-dev

# Verify cluster
kubectl get nodes
kubectl get pods -A
```

### Day 8: Install AWS Load Balancer Controller
```bash
# Download IAM policy for ALB controller
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json

# Create IAM policy
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# Create service account
eksctl create iamserviceaccount \
  --cluster=starships-dev \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=starships-dev \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# Verify installation
kubectl get deployment -n kube-system aws-load-balancer-controller
```

## 📊 Validation Checklist for Phase 1

After completing Phase 1, verify:

- [ ] AWS CLI configured and working
- [ ] Terraform state stored in S3
- [ ] VPC created with public/private subnets
- [ ] EKS cluster running with worker nodes
- [ ] kubectl can connect to cluster
- [ ] AWS Load Balancer Controller installed
- [ ] All resources tagged properly
- [ ] CloudWatch logs are collecting

## 💰 Cost Check After Phase 1
```bash
# Check current month spending
aws ce get-cost-and-usage \
    --time-period Start=2024-01-01,End=2024-01-31 \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --group-by Type=DIMENSION,Key=SERVICE

# Should be approximately:
# - EKS Control Plane: ~$73
# - EC2 Instances: ~$30 (spot)
# - NAT Gateway: ~$15
# - Data Transfer: ~$5
# Total: ~$123 for dev environment
```

---

**🎉 Phase 1 Complete!** 

Your dev environment is now running on AWS EKS. Next step is deploying your application in [Phase 2](./phase-2-application-deployment.md).

**Troubleshooting**: If you encounter issues, check the [troubleshooting guide](./troubleshooting.md) or review AWS CloudTrail logs for detailed error information.