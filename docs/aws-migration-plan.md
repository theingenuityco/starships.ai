# AWS EKS Migration Plan - Complete Guide

## 📋 Migration Overview

**From**: DigitalOcean Kubernetes → **To**: AWS EKS
**Timeline**: 4 weeks (clean cutover, no gradual migration)
**Budget**: $5000 AWS credits (16+ months runway)
**Primary Users**: India-based

### Architecture Decisions
- **Region**: ap-south-1 (Mumbai) - lowest latency for Indian users
- **Database**: RDS PostgreSQL for prod ($18/month), embedded for dev (free)
- **Container Registry**: Keep GHCR (no migration needed)
- **Infrastructure**: EC2 managed nodes, Terraform for IaC
- **DNS**: Route53 ($0.50/month) for proper AWS integration
- **Monitoring**: CloudWatch (mostly free tier)

### Cost Summary
- **Current DO Cost**: ~$148/month
- **Target AWS Cost**: ~$304/month
- **Credit Runway**: 16+ months
- **Optimized Cost**: ~$250/month (with spot instances)

---

## 🗓️ PHASE 1: Foundation Setup (Week 1)

### Day 1-2: AWS Account & Security Setup

#### Task 1.1: Secure AWS Account
```bash
# 1. Enable MFA on root account (AWS Console)
# 2. Create IAM admin user (not root)
# 3. Configure AWS CLI
aws configure
# Access Key ID: [Your IAM user access key]
# Secret Access Key: [Your IAM user secret key]  
# Default region: ap-south-1
# Output format: json

# Verify setup
aws sts get-caller-identity
```

#### Task 1.2: Set Up Billing & Cost Controls
- Set up billing alerts: $100, $200, $300
- Enable Cost Explorer
- Create budget: $400/month with 80% alert

#### Task 1.3: Create Terraform Backend
```bash
# Create S3 bucket for state
BUCKET_SUFFIX=$(date +%s)
BUCKET_NAME="starships-terraform-state-${BUCKET_SUFFIX}"

aws s3 mb s3://${BUCKET_NAME} --region ap-south-1
aws s3api put-bucket-versioning \
    --bucket ${BUCKET_NAME} \
    --versioning-configuration Status=Enabled

# Create DynamoDB for state locking
aws dynamodb create-table \
    --table-name terraform-state-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region ap-south-1

# Store for later use
echo "export TF_STATE_BUCKET=${BUCKET_NAME}" >> ~/.bashrc
source ~/.bashrc
```

### Day 3-4: Infrastructure Setup

#### Task 1.4: Create Terraform Project Structure
```bash
# Create directory structure
mkdir -p terraform/{environments/{dev,prod},modules/{vpc,eks,rds}}

# Create backend configuration
cat > terraform/backend.tf << EOF
terraform {
  required_version = ">= 1.0"
  backend "s3" {
    bucket         = "${TF_STATE_BUCKET}"
    key            = "starships/terraform.tfstate"
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

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      Project   = "starships-ai"
      ManagedBy = "terraform"
    }
  }
}
EOF
```

#### Task 1.5: Create VPC Module
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
  tags = { Name = "starships-${var.environment}-igw" }
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
  count  = var.single_nat_gateway ? 1 : length(var.availability_zones)
  domain = "vpc"
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : length(var.availability_zones)
  
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = { Name = "starships-${var.environment}-public-rt" }
}

resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  }
  
  tags = { Name = "starships-${var.environment}-private-rt-${count.index + 1}" }
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
EOF

# VPC variables
cat > terraform/modules/vpc/variables.tf << 'EOF'
variable "environment" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "public_subnet_cidrs" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }
variable "single_nat_gateway" { type = bool; default = false }
EOF

# VPC outputs
cat > terraform/modules/vpc/outputs.tf << 'EOF'
output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
EOF
```

#### Task 1.6: Deploy Dev VPC
```bash
# Create dev environment
cat > terraform/environments/dev/main.tf << 'EOF'
module "vpc" {
  source = "../../modules/vpc"
  
  environment = "dev"
  vpc_cidr    = "10.1.0.0/16"
  
  availability_zones = ["ap-south-1a", "ap-south-1b"]
  
  public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24"]
  private_subnet_cidrs = ["10.1.10.0/24", "10.1.20.0/24"]
  
  single_nat_gateway = true  # Cost optimization for dev
}
EOF

# Initialize and deploy
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

### Day 5-7: EKS Cluster Setup

#### Task 1.7: Create EKS Module
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
  }
  
  enabled_cluster_log_types = ["api", "audit"]
  
  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
    aws_cloudwatch_log_group.cluster,
  ]
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
  
  depends_on = [
    aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.node_AmazonEC2ContainerRegistryReadOnly,
  ]
}

# IAM Roles
resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role" "node" {
  name = "${var.cluster_name}-node-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
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
EOF

# EKS variables
cat > terraform/modules/eks/variables.tf << 'EOF'
variable "cluster_name" { type = string }
variable "cluster_version" { type = string; default = "1.28" }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_groups" {
  type = map(object({
    instance_types = list(string)
    capacity_type  = string
    min_size      = number
    max_size      = number
    desired_size  = number
  }))
}
EOF

# EKS outputs
cat > terraform/modules/eks/outputs.tf << 'EOF'
output "cluster_name" { value = aws_eks_cluster.main.name }
output "cluster_endpoint" { value = aws_eks_cluster.main.endpoint }
output "cluster_arn" { value = aws_eks_cluster.main.arn }
EOF
```

#### Task 1.8: Deploy Dev EKS Cluster
```bash
# Update dev main.tf to include EKS
cat >> terraform/environments/dev/main.tf << 'EOF'

module "eks" {
  source = "../../modules/eks"
  
  cluster_name = "starships-dev"
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnet_ids
  
  node_groups = {
    main = {
      instance_types = ["t3.medium"]
      capacity_type  = "SPOT"  # 70% cost savings
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
kubectl get nodes
```

#### Task 1.9: Install AWS Load Balancer Controller
```bash
# Download and apply IAM policy
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# Create service account with IRSA
eksctl create iamserviceaccount \
  --cluster=starships-dev \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install controller via Helm
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

**Phase 1 Checkpoint**: 
- [ ] AWS account secured with MFA
- [ ] Terraform backend operational
- [ ] Dev VPC created with subnets
- [ ] EKS cluster running with 2 nodes
- [ ] kubectl connected and working
- [ ] ALB controller installed

---

## 🗓️ PHASE 2: Application Deployment (Week 2)

### Day 8-9: Update Kubernetes Manifests for AWS

#### Task 2.1: Create Updated Namespace
```bash
# k8s/dev/00-namespace.yaml
cat > k8s/dev/00-namespace.yaml << 'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: starships-dev
  labels:
    name: starships-dev
    environment: dev
EOF
```

#### Task 2.2: Update PVC for EBS
```bash
# k8s/dev/02-pvc.yaml  
cat > k8s/dev/02-pvc.yaml << 'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: starships-postgres-pvc
  namespace: starships-dev
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3  # AWS EBS GP3
  resources:
    requests:
      storage: 10Gi
EOF
```

#### Task 2.3: Update Deployment
```bash
# k8s/dev/03-deployment.yaml
cat > k8s/dev/03-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: starships-app
  namespace: starships-dev
  labels:
    app: starships-ai
    environment: dev
spec:
  replicas: 2
  selector:
    matchLabels:
      app: starships-ai
      environment: dev
  template:
    metadata:
      labels:
        app: starships-ai
        environment: dev
    spec:
      imagePullSecrets:
        - name: ghcr-pull-secret
      containers:
        - name: starships
          image: 'ghcr.io/theingenuityco/starships.ai:latest'
          imagePullPolicy: Always
          
          ports:
            - containerPort: 3000
              name: frontend
            - containerPort: 4000
              name: backend
            - containerPort: 8080
              name: proxy

          envFrom:
            - secretRef:
                name: starships-secrets

          livenessProbe:
            httpGet:
              path: /api/health
              port: 4000
            initialDelaySeconds: 60
            periodSeconds: 30

          readinessProbe:
            httpGet:
              path: /api/health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10

          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"

          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data

      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: starships-postgres-pvc

      tolerations:
        - key: "node.kubernetes.io/spot"
          operator: "Exists"
          effect: "NoSchedule"
EOF
```

#### Task 2.4: Update Service
```bash
# k8s/dev/04-service.yaml
cat > k8s/dev/04-service.yaml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: starships-service
  namespace: starships-dev
  labels:
    app: starships-ai
spec:
  type: ClusterIP
  selector:
    app: starships-ai
    environment: dev
  ports:
    - name: frontend
      port: 3000
      targetPort: 3000
    - name: backend
      port: 4000
      targetPort: 4000
    - name: proxy
      port: 8080
      targetPort: 8080
EOF
```

#### Task 2.5: Create ALB Ingress
```bash
# k8s/dev/05-ingress.yaml
cat > k8s/dev/05-ingress.yaml << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-dev
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
    alb.ingress.kubernetes.io/healthcheck-port: "4000"
spec:
  rules:
    - host: dev-starships.example.com  # Replace with your dev domain
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: starships-service
                port:
                  number: 8080
EOF
```

### Day 10-11: Deploy Application to Dev EKS

#### Task 2.6: Create Secrets
```bash
# Create GHCR pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  -n starships-dev

# Create application secrets (use your current values)
kubectl create secret generic starships-secrets \
  --from-literal=OPENAI_API_KEY="your-key" \
  --from-literal=ANTHROPIC_API_KEY="your-key" \
  --from-literal=STRIPE_SECRET_KEY="your-key" \
  --from-literal=POSTGRES_HOST="localhost" \
  --from-literal=POSTGRES_PORT="5432" \
  --from-literal=POSTGRES_USER="postgres" \
  --from-literal=POSTGRES_PASSWORD="password" \
  --from-literal=POSTGRES_DATABASE="starships" \
  --from-literal=JWT_SECRET="your-secret" \
  -n starships-dev
```

#### Task 2.7: Deploy Application
```bash
# Deploy all manifests
kubectl apply -f k8s/dev/00-namespace.yaml
kubectl apply -f k8s/dev/02-pvc.yaml
kubectl apply -f k8s/dev/03-deployment.yaml
kubectl apply -f k8s/dev/04-service.yaml
kubectl apply -f k8s/dev/05-ingress.yaml

# Verify deployment
kubectl get all -n starships-dev
kubectl get ingress -n starships-dev
kubectl logs deployment/starships-app -n starships-dev
```

#### Task 2.8: Test Application
```bash
# Get ALB endpoint
ALB_ENDPOINT=$(kubectl get ingress starships-ingress -n starships-dev \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "ALB Endpoint: $ALB_ENDPOINT"

# Test health endpoint
curl -i http://$ALB_ENDPOINT/api/health

# Test frontend (if accessible)
curl -i http://$ALB_ENDPOINT/
```

**Phase 2 Checkpoint**:
- [ ] Kubernetes manifests updated for AWS
- [ ] Application deployed to dev EKS
- [ ] ALB created and functional
- [ ] Health checks passing
- [ ] Application accessible via ALB

---

## 🗓️ PHASE 3: Production Environment (Week 3)

### Day 15-16: Create Production Infrastructure

#### Task 3.1: Create Production EKS
```bash
# Create prod environment
cat > terraform/environments/prod/main.tf << 'EOF'
module "vpc" {
  source = "../../modules/vpc"
  
  environment = "prod"
  vpc_cidr    = "10.0.0.0/16"
  
  availability_zones = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
  
  single_nat_gateway = false  # HA for production
}

module "eks" {
  source = "../../modules/eks"
  
  cluster_name = "starships-prod"
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnet_ids
  
  node_groups = {
    main = {
      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"  # Reliability for prod
      min_size      = 2
      max_size      = 5
      desired_size  = 2
    }
  }
}

module "rds" {
  source = "../../modules/rds"
  
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  engine_version    = "15.4"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
}
EOF

# Deploy production infrastructure
cd terraform/environments/prod
terraform init
terraform plan
terraform apply
```

#### Task 3.2: Create RDS Module
```bash
# Create RDS module
cat > terraform/modules/rds/main.tf << 'EOF'
# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "starships-prod-db-subnet-group"
  subnet_ids = var.private_subnet_ids
  
  tags = { Name = "starships-prod-db-subnet-group" }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "starships-prod-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]  # VPC CIDR
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier = "starships-prod-db"
  
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class
  
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "starships"
  username = "postgres"
  password = "your-secure-password-here"  # Change this!
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  
  skip_final_snapshot = true  # For dev/test
  deletion_protection = false # For dev/test
  
  tags = { Name = "starships-prod-db" }
}
EOF

# RDS variables
cat > terraform/modules/rds/variables.tf << 'EOF'
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "engine_version" { type = string }
variable "instance_class" { type = string }
variable "allocated_storage" { type = number }
variable "max_allocated_storage" { type = number; default = 100 }
variable "backup_retention_period" { type = number }
variable "backup_window" { type = string }
variable "maintenance_window" { type = string }
EOF

# RDS outputs
cat > terraform/modules/rds/outputs.tf << 'EOF'
output "db_endpoint" { value = aws_db_instance.main.endpoint }
output "db_port" { value = aws_db_instance.main.port }
output "db_name" { value = aws_db_instance.main.db_name }
EOF
```

### Day 17-18: DNS and SSL Setup

#### Task 3.3: Set Up Route53
```bash
# Create hosted zone
aws route53 create-hosted-zone \
    --name starships.ai \
    --caller-reference $(date +%s)

# Get nameservers
aws route53 list-hosted-zones-by-name --dns-name starships.ai

# Update Namecheap nameservers to Route53 nameservers
# (Do this manually in Namecheap dashboard)
```

#### Task 3.4: Request SSL Certificate
```bash
# Request certificate via ACM
aws acm request-certificate \
    --domain-name starships.ai \
    --subject-alternative-names www.starships.ai \
    --validation-method DNS \
    --region ap-south-1

# Get certificate ARN
aws acm list-certificates --region ap-south-1

# Add DNS validation records to Route53
# (Follow AWS Console instructions for DNS validation)
```

### Day 19-21: GitHub Actions Migration

#### Task 3.5: Update GitHub Secrets
Add these secrets in GitHub repository settings:
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI...
AWS_REGION=ap-south-1
EKS_CLUSTER_DEV=starships-dev
EKS_CLUSTER_PROD=starships-prod

# RDS Production secrets
RDS_HOST=starships-prod-db.xxx.ap-south-1.rds.amazonaws.com
RDS_PORT=5432
RDS_USER=postgres
RDS_PASSWORD=your-secure-password
RDS_DATABASE=starships
```

#### Task 3.6: Update GitHub Actions Workflow
```bash
# Replace .github/workflows/build-and-deploy.yml
cat > .github/workflows/build-and-deploy.yml << 'EOF'
name: Build and Deploy to AWS EKS Dev

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: theingenuityco/starships.ai
  AWS_REGION: ap-south-1

jobs:
  # ... (keep existing calculate-version and build-dev jobs)

  deploy-dev:
    name: Deploy to AWS EKS Dev
    runs-on: ubuntu-latest
    needs: [calculate-version, build-dev]
    environment: dev
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig for EKS
        run: |
          aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ secrets.EKS_CLUSTER_DEV }}
          kubectl get nodes

      - name: Apply Kubernetes manifests
        run: |
          kubectl apply -f k8s/dev/
          kubectl rollout status deployment/starships-app -n starships-dev --timeout=300s

      - name: Update image in deployment
        run: |
          IMAGE_TAG="${{ needs.calculate-version.outputs.new_release_version }}"
          kubectl set image deployment/starships-app \
            starships=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${IMAGE_TAG} \
            -n starships-dev
EOF
```

**Phase 3 Checkpoint**:
- [ ] Production EKS cluster deployed
- [ ] RDS PostgreSQL instance running
- [ ] Route53 hosted zone configured
- [ ] SSL certificate issued and validated
- [ ] GitHub Actions updated for AWS deployment

---

## 🗓️ PHASE 4: Migration & Cutover (Week 4)

### Day 22-24: Production Deployment

#### Task 4.1: Create Production Kubernetes Manifests
```bash
# Copy dev manifests to prod
cp -r k8s/dev/ k8s/prod/

# Update namespace
sed -i 's/starships-dev/starships-prod/g' k8s/prod/*.yaml

# Update ingress for production domain
cat > k8s/prod/05-ingress.yaml << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-prod
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:ACCOUNT:certificate/CERT-ID
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
spec:
  rules:
    - host: starships.ai
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: starships-service
                port:
                  number: 8080
  tls:
    - hosts:
        - starships.ai
EOF
```

#### Task 4.2: Deploy to Production
```bash
# Configure kubectl for production
aws eks update-kubeconfig --region ap-south-1 --name starships-prod

# Create production secrets with RDS connection
kubectl create secret generic starships-secrets \
  --from-literal=OPENAI_API_KEY="your-key" \
  --from-literal=ANTHROPIC_API_KEY="your-key" \
  --from-literal=STRIPE_SECRET_KEY="your-key" \
  --from-literal=POSTGRES_HOST="starships-prod-db.xxx.ap-south-1.rds.amazonaws.com" \
  --from-literal=POSTGRES_PORT="5432" \
  --from-literal=POSTGRES_USER="postgres" \
  --from-literal=POSTGRES_PASSWORD="your-secure-password" \
  --from-literal=POSTGRES_DATABASE="starships" \
  --from-literal=POSTGRES_SSL="true" \
  --from-literal=JWT_SECRET="your-secret" \
  -n starships-prod

# Deploy application
kubectl apply -f k8s/prod/
kubectl get all -n starships-prod
```

#### Task 4.3: Initialize Production Database
```bash
# Connect to RDS and create initial schema
PGPASSWORD=your-secure-password psql -h starships-prod-db.xxx.ap-south-1.rds.amazonaws.com -U postgres -d starships -f packages/models/migrations/000_postgresql_schema.sql
```

### Day 25-26: DNS Cutover

#### Task 4.4: Test Production Environment
```bash
# Get production ALB endpoint
ALB_ENDPOINT=$(kubectl get ingress starships-ingress -n starships-prod \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Test with ALB endpoint
curl -i https://$ALB_ENDPOINT/api/health -H "Host: starships.ai"
```

#### Task 4.5: Update DNS Records
```bash
# Create A record pointing to ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "starships.ai",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_ENDPOINT'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "ZP97RAFLXTNZK"
        }
      }
    }]
  }'

# Create www CNAME record
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE", 
      "ResourceRecordSet": {
        "Name": "www.starships.ai",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "starships.ai"}]
      }
    }]
  }'
```

#### Task 4.6: Verify Production
```bash
# Test production domain
curl -i https://starships.ai/api/health
curl -i https://www.starships.ai/

# Monitor logs
kubectl logs deployment/starships-app -n starships-prod -f
```

### Day 27-28: Cleanup and Optimization

#### Task 4.7: Decommission DigitalOcean
```bash
# Backup DigitalOcean data (if any)
# Delete DigitalOcean Kubernetes clusters
# Cancel DigitalOcean services
```

#### Task 4.8: Cost Optimization
```bash
# Enable cost monitoring
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget '{
    "BudgetName": "starships-monthly",
    "BudgetLimit": {"Amount": "400", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }'

# Set up cost alerts
aws budgets put-notification \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget-name starships-monthly \
  --notification '{
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80,
    "ThresholdType": "PERCENTAGE"
  }' \
  --subscriber '{
    "SubscriptionType": "EMAIL",
    "Address": "your-email@example.com"
  }'
```

**Phase 4 Checkpoint**:
- [ ] Production application deployed on EKS
- [ ] RDS database initialized and connected
- [ ] DNS switched to Route53 and ALB
- [ ] SSL certificate working
- [ ] DigitalOcean resources decommissioned
- [ ] Cost monitoring enabled

---

## 📊 Cost Summary & Monitoring

### Monthly Cost Breakdown
```
EKS Control Plane: $73 × 2 = $146
Dev Nodes (spot): $30
Prod Nodes: $110  
RDS: $18
ALB: $36
Route53: $0.50
Data Transfer: ~$50
CloudWatch: ~$10
Total: ~$400/month

With Credits: 12.5 months free operation
Optimized: ~$300/month with scheduled scaling
```

### Cost Optimization Checklist
- [ ] Spot instances for dev environment (70% savings)
- [ ] Scheduled scaling for dev (scale down nights/weekends)
- [ ] Reserved instances for production (25% discount after year 1)
- [ ] S3 + CloudFront for static assets
- [ ] Regular cost reviews and right-sizing

### Monitoring Setup
- [ ] CloudWatch dashboards for key metrics
- [ ] Cost anomaly detection enabled
- [ ] Budget alerts configured
- [ ] Weekly cost review meetings scheduled

---

## 🚨 Troubleshooting Guide

### Common Issues

#### EKS Access Issues
```bash
aws eks update-kubeconfig --region ap-south-1 --name starships-dev
kubectl auth can-i "*" "*"
```

#### ALB Not Creating
```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
kubectl describe ingress starships-ingress -n starships-dev
```

#### RDS Connection Issues
```bash
# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxx

# Test connectivity from EKS node
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- psql -h RDS_ENDPOINT -U postgres
```

#### SSL Certificate Issues
```bash
aws acm describe-certificate --certificate-arn arn:aws:acm:...
```

### Rollback Procedures

#### Emergency DNS Rollback
```bash
# Switch DNS back to DigitalOcean (if kept as backup)
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://rollback.json
```

#### Application Rollback
```bash
kubectl rollout undo deployment/starships-app -n starships-prod
kubectl rollout status deployment/starships-app -n starships-prod
```

---

## ✅ Final Checklist

### Pre-Migration
- [ ] AWS account setup with MFA
- [ ] $5000 credits applied and verified
- [ ] Billing alerts configured
- [ ] Terraform installed and configured
- [ ] kubectl and AWS CLI installed

### Phase 1 Complete
- [ ] VPC and networking deployed
- [ ] Dev EKS cluster operational
- [ ] ALB controller installed
- [ ] Basic connectivity verified

### Phase 2 Complete
- [ ] Application deployed to dev EKS
- [ ] Health checks passing
- [ ] ALB routing working
- [ ] All services functional

### Phase 3 Complete
- [ ] Production infrastructure deployed
- [ ] RDS database operational
- [ ] Route53 and SSL configured
- [ ] GitHub Actions updated

### Phase 4 Complete
- [ ] Production application deployed
- [ ] DNS cutover completed
- [ ] DigitalOcean decommissioned
- [ ] Cost monitoring enabled

### Post-Migration
- [ ] Performance monitoring setup
- [ ] Backup procedures documented
- [ ] Cost optimization implemented
- [ ] Team trained on AWS operations

---

**🎉 Migration Complete!**

Your starships.ai application is now running on AWS EKS with enterprise-grade infrastructure, managed database, global DNS, and automatic SSL certificates. The migration provides a solid foundation for scaling to serve your Indian user base and beyond.

**Next Steps**: Monitor costs, optimize performance, and leverage AWS services for new features as your platform grows.