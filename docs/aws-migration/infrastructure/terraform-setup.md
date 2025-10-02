# Terraform Infrastructure Setup

## 📋 Overview

This guide covers setting up the Terraform infrastructure for AWS EKS deployment. We'll use Terraform modules for best practices and maintainability.

## 🏗️ Infrastructure Components

### Core Infrastructure
- **VPC**: Virtual Private Cloud with public/private subnets
- **EKS**: Managed Kubernetes clusters (dev & prod)
- **RDS**: PostgreSQL database for production
- **ALB**: Application Load Balancer
- **Route53**: DNS hosted zone
- **IAM**: Roles and policies

## 📁 Terraform Project Structure

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       └── terraform.tfvars
├── modules/
│   ├── eks/
│   ├── rds/
│   ├── vpc/
│   └── dns/
└── shared/
    ├── backend.tf
    └── providers.tf
```

## 🔧 Initial Setup Steps

### 1. AWS CLI Configuration
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: ap-south-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

### 2. Terraform Installation
```bash
# Install Terraform (macOS)
brew install terraform

# Or Linux
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Verify installation
terraform version
```

### 3. Create Terraform Backend
```bash
# Create S3 bucket for state (replace with unique name)
aws s3 mb s3://starships-terraform-state-$(date +%s) --region ap-south-1

# Create DynamoDB table for state locking
aws dynamodb create-table \
    --table-name terraform-state-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region ap-south-1
```

## 📋 Terraform Configuration Templates

### Backend Configuration (shared/backend.tf)
```hcl
terraform {
  required_version = ">= 1.0"
  
  backend "s3" {
    bucket         = "starships-terraform-state-TIMESTAMP"  # Replace with your bucket
    key            = "environments/ENVIRONMENT/terraform.tfstate"
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
```

### Provider Configuration (shared/providers.tf)
```hcl
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "starships-ai"
      ManagedBy   = "terraform"
      Owner       = "starships-team"
    }
  }
}

data "aws_eks_cluster" "cluster" {
  name = module.eks.cluster_name
  depends_on = [module.eks]
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
  depends_on = [module.eks]
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}
```

### Dev Environment (environments/dev/main.tf)
```hcl
module "vpc" {
  source = "../../modules/vpc"
  
  environment = var.environment
  vpc_cidr    = "10.1.0.0/16"
  
  availability_zones = ["ap-south-1a", "ap-south-1b"]
  
  public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_subnet_cidrs = ["10.1.10.0/24", "10.1.20.0/24"]
  
  enable_nat_gateway = true
  single_nat_gateway = true  # Cost optimization for dev
}

module "eks" {
  source = "../../modules/eks"
  
  environment = var.environment
  cluster_name = "starships-${var.environment}"
  cluster_version = "1.28"
  
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  
  # Node groups
  node_groups = {
    main = {
      instance_types = ["t3.medium"]
      capacity_type  = "SPOT"  # Cost optimization
      min_size      = 1
      max_size      = 3
      desired_size  = 2
    }
  }
}

# No RDS for dev - using embedded PostgreSQL
```

### Prod Environment (environments/prod/main.tf)
```hcl
module "vpc" {
  source = "../../modules/vpc"
  
  environment = var.environment
  vpc_cidr    = "10.0.0.0/16"
  
  availability_zones = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
  
  enable_nat_gateway = true
  single_nat_gateway = false  # HA for production
}

module "eks" {
  source = "../../modules/eks"
  
  environment = var.environment
  cluster_name = "starships-${var.environment}"
  cluster_version = "1.28"
  
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  
  # Node groups
  node_groups = {
    main = {
      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"
      min_size      = 2
      max_size      = 5
      desired_size  = 2
    }
  }
}

module "rds" {
  source = "../../modules/rds"
  
  environment = var.environment
  
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  eks_security_group_id = module.eks.node_security_group_id
  
  # Database configuration
  engine_version       = "15.4"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  max_allocated_storage = 100
  
  # Backup configuration
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
}

module "dns" {
  source = "../../modules/dns"
  
  domain_name = var.domain_name
  environment = var.environment
  
  # Will be connected to ALB later
}
```

## 🔐 Security Configuration

### IAM Roles and Policies
```hcl
# EKS Cluster Role
resource "aws_iam_role" "eks_cluster_role" {
  name = "starships-${var.environment}-eks-cluster-role"
  
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

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster_role.name
}

# Node Group Role
resource "aws_iam_role" "eks_node_role" {
  name = "starships-${var.environment}-eks-node-role"
  
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

# Required policies for node group
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_role.name
}
```

## 🚀 Deployment Commands

### Initialize and Deploy Dev Environment
```bash
# Navigate to dev environment
cd terraform/environments/dev

# Update backend configuration with your bucket name
# Edit backend.tf to replace TIMESTAMP with your bucket suffix

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars << EOF
aws_region = "ap-south-1"
environment = "dev"
domain_name = "starships.ai"
EOF

# Plan deployment
terraform plan

# Apply deployment
terraform apply
```

### Deploy Production Environment
```bash
# Navigate to prod environment
cd ../prod

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars << EOF
aws_region = "ap-south-1"
environment = "prod"
domain_name = "starships.ai"
EOF

# Plan deployment
terraform plan

# Apply deployment
terraform apply
```

## 📊 Cost Monitoring

### Terraform Cost Estimation
```bash
# Install infracost for cost estimation
curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh

# Set up infracost
infracost auth login

# Estimate costs
infracost breakdown --path .
```

### Resource Tagging for Cost Tracking
All resources are automatically tagged with:
- `Environment`: dev/prod
- `Project`: starships-ai
- `ManagedBy`: terraform
- `Owner`: starships-team

## 🔧 Maintenance and Updates

### Terraform State Management
```bash
# Check current state
terraform state list

# Import existing resources (if needed)
terraform import aws_instance.example i-1234567890abcdef0

# Refresh state
terraform refresh

# Plan changes
terraform plan

# Apply changes
terraform apply
```

### Module Updates
```bash
# Update provider versions
terraform init -upgrade

# Validate configuration
terraform validate

# Format code
terraform fmt -recursive
```

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Errors**
   ```bash
   aws sts get-caller-identity
   aws configure list
   ```

2. **State Lock Issues**
   ```bash
   terraform force-unlock LOCK_ID
   ```

3. **EKS Access Issues**
   ```bash
   aws eks update-kubeconfig --region ap-south-1 --name starships-dev
   kubectl get nodes
   ```

4. **Resource Already Exists**
   ```bash
   terraform import <resource_type>.<resource_name> <resource_id>
   ```

---

*Next: Follow the [implementation guide](../implementation-guide.md) to deploy your infrastructure step by step.*