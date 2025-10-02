# AWS EKS Migration Plan

This directory contains the comprehensive plan and documentation for migrating from DigitalOcean to AWS EKS.

## 📋 Migration Overview

**Current State**: DigitalOcean Kubernetes clusters (dev & prod)
**Target State**: AWS EKS clusters with managed services
**Timeline**: 4 weeks
**Status**: Planning phase

## 📚 Documentation Structure

### Planning Documents
- [`migration-overview.md`](./migration-overview.md) - Complete migration strategy and decisions
- [`architecture-comparison.md`](./architecture-comparison.md) - DigitalOcean vs AWS architecture comparison
- [`cost-analysis.md`](./cost-analysis.md) - Detailed cost breakdown and optimization

### Implementation Guides
- [`infrastructure/`](./infrastructure/) - Terraform configurations and setup guides
- [`kubernetes/`](./kubernetes/) - Updated K8s manifests for AWS
- [`cicd/`](./cicd/) - GitHub Actions workflow updates
- [`database/`](./database/) - RDS setup and migration strategy

### Operations
- [`monitoring/`](./monitoring/) - CloudWatch setup and dashboards
- [`security/`](./security/) - IAM roles and security configurations
- [`backup-recovery/`](./backup-recovery/) - Disaster recovery procedures

## 🚀 Quick Start

1. **Review the Migration Overview**: Start with [`migration-overview.md`](./migration-overview.md)
2. **Check Prerequisites**: Ensure AWS account setup and credits
3. **Follow Implementation Guide**: Step-by-step in [`implementation-guide.md`](./implementation-guide.md)
4. **Deploy Dev Environment**: Test everything in development first
5. **Deploy Production**: Production deployment and cutover

## 📊 Migration Timeline

| Week | Phase | Focus |
|------|--------|-------|
| 1 | Foundation | AWS setup, VPC, dev EKS cluster |
| 2 | Application | Deploy app to dev, test functionality |
| 3 | Production | Prod EKS, RDS, GitHub Actions |
| 4 | Cutover | DNS switch, monitoring, DigitalOcean shutdown |

## 🎯 Success Criteria

- [ ] Dev environment fully functional on AWS EKS
- [ ] Production environment deployed with RDS database
- [ ] CI/CD pipeline updated for AWS deployment
- [ ] DNS switched to Route53
- [ ] Monitoring and alerting functional
- [ ] DigitalOcean resources decommissioned
- [ ] Cost under $350/month (within credit budget)

## 🔗 Related Resources

- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)

---

*Last Updated: 2025-10-02*
*Author: Migration Planning Team*