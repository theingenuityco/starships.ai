````markdown
```markdown
# 🚀 Starships.ai — Ideal AWS Architecture (No RDS, No CDN, Cost-Effective, Scalable)

---

## 🌍 1️⃣ High-Level Overview

A full-stack cloud architecture using:

- **AWS EKS** for running your fat container (Nginx + Node.js + Express + Next.js)
- **EC2 + EBS** for PostgreSQL
- **AWS Backup** for daily automated EBS snapshots
- **Route 53** for DNS
- **IAM + OIDC** for GitHub Actions deployments
- **ALB / NLB** for ingress routing
- _(No CloudFront, No CloudWatch, No HPA/PDB for simplicity and cost control)_

---

### 🧱 Core Principles

| Principle                 | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| **No RDS**                | Use self-managed PostgreSQL on EC2 with EBS.                   |
| **No CDN**                | Direct traffic via ALB (simpler, lower latency within region). |
| **No HPA/PDB**            | Static replicas for predictable scaling and low overhead.      |
| **Isolated environments** | Separate VPCs and EKS clusters for `dev` and `prod`.           |
| **Stateless apps**        | Fat container handles app logic; persistence only on DB.       |
| **Durable persistence**   | PostgreSQL on EBS with AWS Backup daily snapshots.             |
| **Least privilege IAM**   | OIDC roles for CI/CD; fine-grained permissions.                |
| **Scalable yet minimal**  | Manual scaling and vertical upgrades when needed.              |

---

## 🧩 2️⃣ Architecture Diagram (Text View)
```
````

                        ┌───────────────────────────────┐
                        │        Route 53 (DNS)         │
                        └──────────────┬────────────────┘
                                       │
                                       ▼
                          ┌────────────────────┐
                          │ ALB / NLB Ingress  │
                          │ (80 / 443 ports)   │
                          └───────┬────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────┐
                    │       AWS EKS Cluster          │
                    │ (starships-dev / starships-prod)│
                    ├───────────────────────────────┤
                    │ Namespace: starships-dev       │
                    │   Deployment: starships-fat    │
                    │   Service: LoadBalancer        │
                    │   Replicas: 1 (dev) / 2 (prod) │
                    │   Stateless, GHCR-based deploy │
                    └───────────────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────┐
                    │ EC2 Instance (PostgreSQL 15)   │
                    │   VPC Private Subnet            │
                    │   Attached EBS (gp3, 50–100GB)  │
                    │   Managed by AWS Backup         │
                    │   Daily snapshots (30-day TTL)  │
                    └───────────────────────────────┘

```

---

## ⚙️ 3️⃣ AWS Components Breakdown

### 🔹 EKS (Elastic Kubernetes Service)
**Purpose:** Run your stateless fat container app stack.

| Component | Purpose |
|------------|----------|
| Deployment | Nginx + Next.js + Express + Supervisor container |
| Service | Type `LoadBalancer` (ALB-backed) |
| Storage | None — stateless, all persistence via PostgreSQL |
| Replicas | 1 (dev) / 2 (prod) — manually scaled |
| Namespace | `starships-dev` / `starships-prod` |

---

### 🔹 EC2 (PostgreSQL host)
**Purpose:** Dedicated, self-managed PostgreSQL instance per environment.

| Component | Purpose |
|------------|----------|
| EC2 Instance | t3.small (dev) / t3.medium (prod) |
| Volume | EBS gp3 (50–100 GB) at `/var/lib/postgresql/data` |
| Backup | **Automated via AWS Backup Plan** — daily incremental snapshots |
| Retention | 30 days (older backups auto-deleted) |
| Tag-based backup selection | Tag: `Backup=starships-db` |
| Security Group | Only allows inbound 5432 from EKS nodes |
| Availability | Single AZ, can add replica manually later |

🧠 **AWS Backup Configuration Summary**
- **Plan name:** `starships-db-backup-plan`
- **Frequency:** Daily
- **Vault:** `starships-db-vault`
- **Retention:** 30 days
- **Estimated cost:** ~$6/month per environment
- **Storage:** Incremental, encrypted EBS snapshots
- **Restore:** 1-click restore → new volume attach to EC2

---

### 🔹 Networking (VPC Design)
| Layer | Description |
|--------|-------------|
| VPC | Dedicated per environment |
| Subnets | 2× Public (ALB), 2× Private (EKS + EC2) |
| Routing | NAT Gateway for outbound EKS traffic |
| Security Groups | EKS → EC2 (5432), ALB → EKS (80/443) |
| DNS | Route 53 zones: `dev.starships.ai`, `app.starships.ai` |

---

### 🔹 IAM & Security
| Role | Purpose |
|------|----------|
| GitHub Actions Deploy Role | OIDC trust for deploy-dev/prod.yml |
| EC2 Postgres Role | Allows AWS Backup service access |
| EKS Node Role | Pull from GHCR, manage networking |
| ACM Certificate | TLS termination at ALB |
| AWS Backup Service Role | Manages daily snapshot creation |
| IAM Boundaries | Principle of least privilege enforced |

---

## 🧰 4️⃣ Deployment Pipelines

### 🏗️ Build pipeline (CI)
`build-image.yml`
- Semantic versioning
- Build and push fat container to GHCR
- Create GitHub release
- Output image tag

### 🚀 Deploy pipeline (CD)
`deploy-dev.yml` / `deploy-prod.yml`
- Assume AWS OIDC role
- `aws eks update-kubeconfig`
- Apply manifests (`k8s/dev` / `k8s/prod`)
- Create Kubernetes secrets from GitHub env
- Set image version dynamically
- Rollout + verify deployment
- Output ALB DNS endpoint

---

## 🧩 5️⃣ Data Flow Summary

```

[ User ]
↓
[ Route 53 ]
↓
[ ALB → EKS Service ]
↓
[ starships-fat Pod (Nginx + Express + Next.js) ]
↓
[ PostgreSQL on EC2 (private subnet) ]
↓
[ EBS Volume (persistent DB) ]
↓
[ AWS Backup Vault (daily incremental snapshots) ]

```

---

## 💾 6️⃣ Backup Strategy

| Data                 | Location         | Backup Method                         | Retention | Est. Monthly Cost |
| -------------------- | ---------------- | ------------------------------------- | --------- | ---------------- |
| PostgreSQL (EC2)     | AWS Backup Vault | Daily incremental EBS snapshots (tag) | 30 days   | ~$6 per env |
| GitHub repo          | GitHub           | Auto via GitHub                       | N/A       | Free |
| EKS Pods             | Stateless        | N/A                                   | N/A       | — |

✅ **Fully managed by AWS Backup** — no cron jobs, minimal cost, 1-click restore.

---

## 🔄 7️⃣ Scaling Strategy

| Component      | Scaling Type | Method                          |
| -------------- | -------------| -------------------------------- |
| EKS Pods       | Manual       | 1 (dev) / 2 (prod) replicas     |
| EKS Nodes      | Manual       | Adjust node group size          |
| PostgreSQL     | Vertical     | Resize EC2/EBS                  |
| DB Replication | Future option| Streaming replication           |

---

## 💰 8️⃣ Cost Estimate (Monthly)

| Resource                 | Dev     | Prod    | Total            |
| ------------------------ | ------- | ------- | ---------------- |
| EKS (2× t3.small nodes)  | $25     | —       | $25              |
| EKS (2× t3.medium nodes) | —       | $40     | $40              |
| EC2 PostgreSQL           | $12     | $20     | $32              |
| AWS Backup Snapshots     | $6      | $6      | $12              |
| ALB / NLB                | $15     | $20     | $35              |
| **Total**                | **$58** | **$86** | **≈ $144/month** |

💡 Backup is incremental, cost grows only with data change (very efficient).

---

## 🔐 9️⃣ Security Summary

- Private subnets for EC2 (DB)
- ALB handles HTTPS via ACM
- AWS Backup snapshots are encrypted
- Security groups strictly control access (EKS → DB only)
- GitHub Actions uses OIDC (no static AWS keys)
- IAM policies scoped to least privilege
- Restore permissions limited to admin roles only

---

## 🧭 10️⃣ Scalability Roadmap

| Stage                 | Focus             | Upgrade                                |
| --------------------- | ----------------- | -------------------------------------- |
| Stage 1 (Now)         | Stable + low-cost | EKS + EC2 + AWS Backup                 |
| Stage 2 (~1000 users) | Performance       | Add HPA, increase pod replicas         |
| Stage 3 (~5000 users) | High availability | Multi-AZ DB replica                    |
| Stage 4 (~10k+ users) | Scale-out         | Add CDN or migrate to Aurora if needed |

---

## ✅ Final Architecture Summary

| Layer                | AWS Service                 | Purpose                        |
| -------------------- | --------------------------- | ------------------------------ |
| **Frontend/Backend** | EKS + Nginx + Node.js       | Stateless fat container        |
| **Database**         | EC2 (PostgreSQL) + EBS      | Self-managed DB with persistence |
| **Backups**          | AWS Backup                  | Daily automated incremental EBS snapshots |
| **CI/CD**            | GitHub Actions + OIDC       | Build (GHCR) + Deploy (EKS)    |
| **Ingress**          | ALB + ACM                   | Public traffic, HTTPS          |
| **DNS**              | Route 53                    | Domain mapping                 |
| **Monitoring**       | Manual / CLI-based          | Simplified metrics/logs        |
| **Security**         | IAM + SGs + Private subnets | Access isolation + encryption  |

---

## 🧠 Why This Works Perfectly for You

✅ **Fully automated DB backups via AWS Backup**
✅ **Stateless EKS apps, persistent PostgreSQL on EC2**
✅ **No RDS / No CDN / No CloudWatch** — lean + minimal stack
✅ **Predictable scaling** — 1–2 replicas only
✅ **Low Cost** — ~$145/month all-in
✅ **1-click recovery** — snapshots auto-manage
```
