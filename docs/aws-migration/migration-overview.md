# AWS EKS Migration Overview

## 🎯 Migration Goals & Context

### Current Situation
- **Platform**: DigitalOcean Kubernetes
- **Status**: Pre-production (no live users)
- **Environments**: Dev and Production clusters
- **Database**: Embedded PostgreSQL in containers
- **CI/CD**: GitHub Actions → GHCR → DigitalOcean K8s

### Migration Drivers
- **Strategic**: Complete migration to AWS ecosystem
- **Geographic**: Primary users in India (better served by AWS Mumbai)
- **Scalability**: Need enterprise-grade infrastructure for growth
- **Credits**: $5000+ AWS credits available
- **Clean Migration**: No production data to migrate

## 🏗️ Target Architecture

### Final AWS Architecture
```
AWS Region: ap-south-1 (Mumbai)
├── VPC (10.0.0.0/16)
│   ├── Public Subnets (ALB, NAT Gateways)
│   └── Private Subnets (EKS nodes, RDS)
├── EKS Clusters
│   ├── starships-dev (t3.medium spot instances)
│   └── starships-prod (t3.large on-demand)
├── RDS PostgreSQL
│   ├── Dev: Embedded PostgreSQL (cost savings)
│   └── Prod: t3.micro single-AZ
├── Application Load Balancer
├── Route53 DNS
└── CloudWatch Monitoring
```

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Region** | ap-south-1 (Mumbai) | Indian users, lowest latency |
| **Multi-Region** | Single region + CloudFront later | Cost optimization, add when needed |
| **Database** | Embedded dev + RDS prod | Balance cost vs reliability |
| **Container Registry** | Keep GHCR | No migration needed |
| **Node Type** | EC2 managed nodes | More control, lower cost |
| **Monitoring** | CloudWatch only | Sufficient for current needs |
| **IaC Tool** | Terraform | Industry standard, cloud agnostic |
| **DNS** | Route53 | Proper AWS integration |

## 💰 Cost Analysis

### Monthly Cost Breakdown
```
EKS Control Plane: $73 × 2 clusters = $146
Dev Nodes (spot): t3.medium × 2 = $30
Prod Nodes: t3.large × 2 = $110  
RDS (prod): t3.micro = $18
Route53: $0.50
Data Transfer: ~$10
Total: ~$304/month

Credit Runway: $5000 ÷ $304 = 16.4 months
```

### Cost Optimization Strategies
- **Spot instances** for dev (70% savings)
- **Schedule shutdown** for dev environment
- **Single AZ RDS** initially
- **Gradual scaling** as user base grows

## 🔄 Migration Strategy

### Phase 1: Foundation (Week 1)
**Goal**: Establish AWS infrastructure and dev environment

```
Day 1-2: AWS Account Setup
- IAM structure and roles
- Billing alerts and cost monitoring
- Terraform state management (S3 + DynamoDB)

Day 3-5: Infrastructure Deployment
- VPC and networking with Terraform
- Dev EKS cluster creation
- ALB Ingress Controller setup

Day 6-7: Application Deployment
- Deploy starships.ai to dev EKS
- Test all functionality
- Validate health endpoints
```

### Phase 2: Production Preparation (Week 2)
**Goal**: Create production environment and update CI/CD

```
Day 8-10: Production Infrastructure
- Production EKS cluster
- RDS PostgreSQL setup
- Security groups and IAM

Day 11-12: CI/CD Migration
- Update GitHub Actions workflows
- AWS credentials and secrets
- Test deployment pipeline

Day 13-14: Integration Testing
- End-to-end testing
- Performance validation
- Security verification
```

### Phase 3: DNS & Monitoring (Week 3)
**Goal**: Prepare for production cutover

```
Day 15-17: DNS Setup
- Route53 hosted zone
- SSL certificates (ACM)
- Update nameservers in Namecheap

Day 18-19: Monitoring & Alerts
- CloudWatch dashboards
- Log aggregation
- Alerting rules

Day 20-21: Final Testing
- Load testing
- Disaster recovery testing
- Backup validation
```

### Phase 4: Cutover (Week 4)
**Goal**: Go live on AWS and decommission DigitalOcean

```
Day 22-24: Production Deployment
- Deploy to production EKS
- Database initialization
- Application testing

Day 25-26: DNS Cutover
- Switch DNS to AWS
- Monitor traffic and performance
- Verify all services

Day 27-28: Cleanup
- Decommission DigitalOcean
- Final cost optimization
- Documentation updates
```

## ⚠️ Risk Assessment & Mitigation

### High-Risk Items
1. **DNS Cutover**
   - Risk: Service interruption
   - Mitigation: Keep DO as backup, gradual DNS TTL reduction

2. **Database Configuration**
   - Risk: Connection issues with RDS
   - Mitigation: Test extensively in dev, connection pooling

3. **GitHub Actions Changes**
   - Risk: Deployment failures
   - Mitigation: Test in dev first, rollback procedures

### Medium-Risk Items
1. **Cost Overruns**
   - Risk: Exceed credit budget
   - Mitigation: Daily cost monitoring, alerts

2. **SSL Certificate Issues**
   - Risk: HTTPS not working
   - Mitigation: Test ACM integration thoroughly

## 🎯 Success Metrics

### Technical Metrics
- [ ] 99.9% uptime during migration
- [ ] <200ms response times from India
- [ ] All health checks passing
- [ ] Zero data loss

### Business Metrics
- [ ] Migration completed within 4 weeks
- [ ] Monthly costs under $350
- [ ] No service interruptions >5 minutes
- [ ] Team confidence in new platform

### Operational Metrics
- [ ] Terraform deploys all infrastructure
- [ ] GitHub Actions successfully deploys
- [ ] Monitoring alerts are functional
- [ ] Backup and recovery tested

## 📋 Prerequisites

### AWS Account Requirements
- [ ] AWS account with billing configured
- [ ] $5000+ credits available
- [ ] IAM admin access
- [ ] AWS CLI configured locally

### Team Requirements
- [ ] Basic Terraform knowledge
- [ ] Kubernetes familiarity
- [ ] AWS services overview training
- [ ] Access to GitHub repository

### Domain Requirements
- [ ] starships.ai domain access (Namecheap)
- [ ] Ability to change nameservers
- [ ] Current DNS configuration documented

## 🔄 Rollback Plan

### Emergency Rollback (If AWS Fails)
1. **Immediate**: Switch DNS back to DigitalOcean (5 minutes)
2. **Short-term**: Keep DO infrastructure for 2 weeks post-migration
3. **Data**: Daily backups to S3 for restore capability

### Partial Rollback Options
- **DNS only**: Point traffic back to DO
- **Database**: Restore from backup to embedded PostgreSQL
- **CI/CD**: Revert GitHub Actions to DO deployment

## 📚 Reference Documentation

### AWS Resources
- [EKS Getting Started](https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html)
- [RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [Route53 Setup](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/)

### Terraform Resources
- [AWS EKS Module](https://registry.terraform.io/modules/terraform-aws-modules/eks/aws/latest)
- [VPC Module](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest)
- [RDS Module](https://registry.terraform.io/modules/terraform-aws-modules/rds/aws/latest)

---

*This document serves as the master plan for the AWS EKS migration. All implementation details are contained in the respective subdirectories.*