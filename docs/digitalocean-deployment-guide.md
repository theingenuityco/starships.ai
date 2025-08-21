# DigitalOcean Kubernetes Deployment Guide for Starships.ai

## Overview

This guide provides a complete, production-ready deployment plan for Starships.ai on DigitalOcean Kubernetes (DOKS). This approach prioritizes simplicity, cost-effectiveness, and quick deployment for MVP testing with 10-50 users.

## Architecture Decision

- **Fat Container Strategy**: Single container with Frontend + Backend + Neo4j bundled
- **Single Node Cluster**: 1 node (2 vCPU, 4GB RAM) for MVP
- **Cost**: ~$40/month total breakdown:
  - Kubernetes node (4GB): $24/month
  - Load Balancer: $12/month  
  - Block Storage (25GB): $2.50/month
  - Bandwidth: ~$1-2/month for MVP traffic
- **No Over-engineering**: Simple kubectl and GitHub Actions, no complex tools

## Cost Comparison

| Provider | Setup | Monthly Cost | Notes |
|----------|-------|--------------|-------|
| **AWS EKS** | 3x t3.large + EKS | $288 | Overkill for MVP |
| **AWS EKS Minimal** | 1x t3.medium + EKS | $128 | $73 just for control plane |
| **DigitalOcean** | 1x 4GB node + LB | $36 | Perfect for MVP |
| **DigitalOcean (no LB)** | 1x 4GB node | $24 | Use NodePort initially |

## 📊 Deployment Progress Tracker

Use this tracker to monitor your deployment progress. Copy to a separate file and check off items as you complete them.

### Overall Progress
```
[▓▓▓▓▓▓▓▓░░░░░░░░░░░░] 40% Complete
Day 1: [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100% ✅
Day 2: [░░░░░░░░░░░░░░░░] 0% ⏳
```

### Detailed Task Tracker

#### 📋 Pre-Flight (15 minutes)
- [ ] **PREP-01** GitHub account verified
- [ ] **PREP-02** GitHub PAT created with `read:packages` scope
- [ ] **PREP-03** Credit card ready for DigitalOcean
- [ ] **PREP-04** API keys collected (OpenAI, Anthropic)
- [ ] **PREP-05** NEO4J [DEFAULT-PASSWORD] chosen
- [ ] **PREP-06** Docker image confirmed in GHCR
```
Pre-Flight Status: [░░░░░░░░░░] 0/6 tasks
```

#### 🏗️ Day 1 - Phase 1: Account Setup (1 hour)
- [x] **D1-P1-01** DigitalOcean account created ⏱️ 5 min ✅
- [x] **D1-P1-02** $200 credit activated ⏱️ 1 min ✅
- [x] **D1-P1-03** API token generated ⏱️ 2 min ✅
- [x] **D1-P1-04** API token saved securely ⏱️ 1 min ✅
- [x] **D1-P1-05** doctl installed ⏱️ 5 min ✅
- [x] **D1-P1-06** doctl authenticated ⏱️ 2 min ✅
- [x] **D1-P1-07** doctl verified working ⏱️ 1 min ✅
```
Phase 1 Status: [▓▓▓▓▓▓▓▓▓▓] 7/7 tasks | Completed ✅
```

#### ☸️ Day 1 - Phase 2: Kubernetes Cluster (30 minutes)
- [x] **D1-P2-01** Cluster creation started ⏱️ 1 min ✅
- [x] **D1-P2-02** Cluster provisioning ⏱️ 5-7 min ✅
- [x] **D1-P2-03** Kubeconfig saved ⏱️ 1 min ✅
- [x] **D1-P2-04** kubectl connection verified ⏱️ 1 min ✅
- [x] **D1-P2-05** Node status checked ⏱️ 1 min ✅
```
Phase 2 Status: [▓▓▓▓▓▓▓▓▓▓] 5/5 tasks | Completed ✅
```

#### 📦 Day 1 - Phase 3: Application Deployment (2 hours)
- [x] **D1-P3-01** Deployment files created ⏱️ 10 min ✅
  - [x] namespace.yaml
  - [x] deployment.yaml
  - [x] service.yaml
  - [x] storage.yaml
- [ ] **D1-P3-02** NGINX Ingress installed (optional) ⏱️ 5 min
- [x] **D1-P3-03** Namespace created ⏱️ 1 min ✅
- [x] **D1-P3-04** GitHub PAT secret created ⏱️ 3 min ⚠️ (PAT validation issue)
- [x] **D1-P3-05** App secrets created ⏱️ 3 min ✅
- [x] **D1-P3-06** Storage PVCs applied ⏱️ 2 min ✅
- [x] **D1-P3-07** Deployment applied ⏱️ 2 min ✅
- [x] **D1-P3-08** Service applied ⏱️ 2 min ✅
- [ ] **D1-P3-09** Pods starting ⏱️ 3-5 min ⚠️ (ImagePullBackOff - PAT issue)
- [ ] **D1-P3-10** Load Balancer provisioning ⏱️ 2-3 min ⏳
```
Phase 3 Status: [▓▓▓▓▓▓▓░░░] 7/10 tasks | In Progress ⚠️
```

#### ✅ Day 1 - Phase 4: Verification (30 minutes)
- [ ] **D1-P4-01** Pod status healthy ⏱️ 2 min
- [ ] **D1-P4-02** Load Balancer IP obtained ⏱️ 1 min
- [ ] **D1-P4-03** Frontend accessible ⏱️ 2 min
- [ ] **D1-P4-04** API health check passing ⏱️ 2 min
- [ ] **D1-P4-05** Neo4j running ⏱️ 2 min
- [ ] **D1-P4-06** Logs checked for errors ⏱️ 5 min
```
Phase 4 Status: [░░░░░░░░░░] 0/6 tasks | Est: 14 min
```

#### 🤖 Day 2 - Phase 5: GitHub Actions (1 hour)
- [ ] **D2-P5-01** GitHub secrets added ⏱️ 10 min
  - [ ] DIGITALOCEAN_ACCESS_TOKEN
  - [ ] NEO4J_PASSWORD
  - [ ] OPENAI_API_KEY
  - [ ] ANTHROPIC_API_KEY
  - [ ] STRIPE_SECRET_KEY (optional)
- [ ] **D2-P5-02** Workflow file created ⏱️ 5 min
- [ ] **D2-P5-03** Workflow committed ⏱️ 2 min
- [ ] **D2-P5-04** Workflow triggered ⏱️ 1 min
- [ ] **D2-P5-05** Deployment successful ⏱️ 10 min ⏳
```
Phase 5 Status: [░░░░░░░░░░] 0/5 tasks | Est: 28 min
```

#### 🌐 Day 2 - Phase 6: Production Setup (1 hour)
- [ ] **D2-P6-01** Domain DNS configured ⏱️ 5 min
- [ ] **D2-P6-02** SSL certificate setup ⏱️ 10 min
- [ ] **D2-P6-03** Monitoring enabled ⏱️ 5 min
- [ ] **D2-P6-04** Backup tested ⏱️ 10 min
- [ ] **D2-P6-05** Final health check ⏱️ 5 min
```
Phase 6 Status: [░░░░░░░░░░] 0/5 tasks | Est: 35 min
```

### 🎯 Milestone Checklist

| Milestone | Status | Criteria |
|-----------|--------|----------|
| **M1: Environment Ready** | ⏳ | DO account, doctl, kubectl working |
| **M2: Cluster Live** | ⏳ | K8s cluster created and accessible |
| **M3: App Deployed** | ⏳ | Pods running, LB active |
| **M4: Production Ready** | ⏳ | Accessible via URL, health checks pass |
| **M5: CI/CD Active** | ⏳ | GitHub Actions deploying successfully |
| **M6: Fully Operational** | ⏳ | Domain, SSL, monitoring active |

### 📈 Time Tracking

| Phase | Estimated | Actual | Status |
|-------|-----------|--------|--------|
| Pre-Flight | 15 min | ___ min | ⏳ |
| Day 1 - Account Setup | 60 min | ___ min | ⏳ |
| Day 1 - Cluster Creation | 30 min | ___ min | ⏳ |
| Day 1 - App Deployment | 120 min | ___ min | ⏳ |
| Day 1 - Verification | 30 min | ___ min | ⏳ |
| Day 2 - GitHub Actions | 60 min | ___ min | ⏳ |
| Day 2 - Production Setup | 60 min | ___ min | ⏳ |
| **Total** | **6.25 hours** | **___ hours** | ⏳ |

### 🚨 Issue Tracker

Use this to log any issues encountered:

| Time | Issue | Resolution | Impact |
|------|-------|------------|--------|
| 10:45 | GitHub PAT authentication failed (403 Forbidden) | Resolved with correct PAT | Image pulled successfully |
| 11:28 | Supervisor config directory missing | Added mkdir command | Pod starts supervisor |
| 11:29 | Neo4j requires Java 17/21, has Java 11 | Using external Neo4j for now | Neo4j not running internally |
| 11:30 | pnpm cache permission denied | Needs Dockerfile fix | App cannot start |

### 🎉 Completion Verification

Final checklist before considering deployment complete:

- [x] Kubernetes cluster operational ✅
- [x] Load Balancer working (tested with nginx) ✅
- [ ] Application accessible via Load Balancer IP (pending Docker fix)
- [ ] All health checks passing (`/health/live`, `/health/ready`)
- [ ] Data persists after pod restart
- [ ] GitHub Actions deployment working
- [ ] Monitoring dashboard accessible
- [ ] Backup strategy tested
- [x] Documentation updated with actual values ✅

---

## Pre-Flight Checklist

Before starting deployment, ensure you have:

- [ ] GitHub account with access to `theingenuityco/starships.ai` repository
- [ ] GitHub Personal Access Token with `read:packages` scope
- [ ] Credit card for DigitalOcean account
- [ ] Domain name (optional, can use IP initially)
- [ ] API keys ready:
  - [ ] OpenAI API key
  - [ ] Anthropic API key  
  - [ ] Stripe secret key (optional for MVP)
  - [ ] NEO4J [DEFAULT-PASSWORD] (you'll create this)
- [ ] Docker image successfully built and pushed to GHCR
- [ ] Basic understanding of kubectl commands

## Day 1: Initial Deployment (4 Hours)

### Hour 1: Account Setup

#### 1.1 Create DigitalOcean Account
```bash
# Sign up at https://www.digitalocean.com
# New users get $200 credit for 60 days
# Add payment method (credit card or PayPal)
```

#### 1.2 Generate API Token
1. Go to API → Tokens/Keys in DO dashboard
2. Generate New Token with read/write scope
3. Save token securely (shown only once)

#### 1.3 Install doctl CLI
```bash
# macOS
brew install doctl

# Linux
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz
tar xf doctl-1.104.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin

# Authenticate
doctl auth init --access-token [AUTH-TOKEN]_HERE

# Verify
doctl account get
```

### Hour 2: Create Kubernetes Cluster

#### 2.1 Create Cluster via CLI
```bash
# Create minimal production cluster
doctl kubernetes cluster create starships-prod \
  --count 1 \
  --size s-2vcpu-4gb \
  --region nyc1 \
  --surge-upgrade=false \
  --auto-upgrade=false

# This takes ~5 minutes
```

#### 2.2 Configure kubectl
```bash
# Save cluster config
doctl kubernetes cluster kubeconfig save starships-prod

# Verify connection
kubectl get nodes
# Should show 1 node in Ready state
```

### Hour 3: Prepare and Deploy Application

#### 3.1 Create Deployment Files

Create a new directory `do-deployment/`:

```bash
mkdir -p do-deployment
```

**do-deployment/namespace.yaml:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: starships-prod
```

**do-deployment/deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: starships-app
  namespace: starships-prod
  labels:
    app: starships-ai
spec:
  replicas: 1  # Single replica for MVP
  selector:
    matchLabels:
      app: starships-ai
  template:
    metadata:
      labels:
        app: starships-ai
    spec:
      containers:
      - name: starships
        image: [DOCKER-REGISTRY-URL]:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: frontend
        - containerPort: 4000
          name: backend
        - containerPort: 7474
          name: neo4j-http
        - containerPort: 7687
          name: neo4j-bolt
        envFrom:
        - secretRef:
            name: starships-secrets
        env:
        - name: NODE_ENV
          value: "production"
        - name: NEO4J_URI
          value: "[NEO4J-LOCAL-URL]"  # Neo4j bundled in container
        resources:
          requests:
            memory: "1Gi"    # Minimum guaranteed
            cpu: "500m"      
          limits:
            memory: "3Gi"    # Increased for Neo4j
            cpu: "1500m"     
        livenessProbe:
          httpGet:
            path: /health/live  # Correct endpoint
            port: 4000
          initialDelaySeconds: 180
          periodSeconds: 30
          timeoutSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready  # Correct endpoint
            port: 4000
          initialDelaySeconds: 120
          periodSeconds: 10
          timeoutSeconds: 5
        volumeMounts:
        - name: neo4j-data
          mountPath: /var/lib/neo4j/data
        - name: app-sessions
          mountPath: /app/data/sessions
      imagePullSecrets:
      - name: ghcr-pull-secret
      volumes:
      - name: neo4j-data
        persistentVolumeClaim:
          claimName: neo4j-data-pvc
      - name: app-sessions
        persistentVolumeClaim:
          claimName: sessions-pvc
```

**do-deployment/service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: starships-service
  namespace: starships-prod
  annotations:
    service.beta.kubernetes.io/do-loadbalancer-protocol: "http"
    service.beta.kubernetes.io/do-loadbalancer-size-unit: "1"  # Smallest LB
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  - port: 4000
    targetPort: 4000
    protocol: TCP
    name: api
  selector:
    app: starships-ai
```

**do-deployment/storage.yaml:**
```yaml
# Neo4j data persistence
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: neo4j-data-pvc
  namespace: starships-prod
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi  # Increased for Neo4j
  storageClassName: do-block-storage
---
# Session data persistence
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sessions-pvc
  namespace: starships-prod
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: do-block-storage
```

#### 3.2 Install NGINX Ingress Controller (Optional but Recommended)

```bash
# Install NGINX Ingress Controller for DigitalOcean
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/do/deploy.yaml

# Wait for it to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

#### 3.3 Create Secrets

```bash
# Create namespace
kubectl apply -f do-deployment/namespace.yaml

# IMPORTANT: Create GitHub Personal Access Token first
# Go to: https://github.com/settings/tokens/new
# Select scope: read:packages
# Save the token securely

# Create image pull secret for PRIVATE GitHub Container Registry
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-[DEFAULT-PASSWORD]=YOUR_GITHUB_PAT_TOKEN \
  --docker-email=your-email@example.com \
  --namespace=starships-prod

# Create application secrets
kubectl create secret generic starships-secrets \
  --from-literal=NEO4J_PASSWORD="your-secure-[DEFAULT-PASSWORD]" \
  --from-literal=OPENAI_API_KEY="sk-..." \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  --from-literal=STRIPE_SECRET_KEY="sk_test_..." \
  --from-literal=STRIPE_WEBHOOK_SECRET="whsec_..." \
  --namespace=starships-prod
```

#### 3.4 Deploy Application

```bash
# Apply all configurations
kubectl apply -f do-deployment/

# Watch deployment progress
kubectl get pods -n starships-prod -w

# Check logs if needed
kubectl logs -f deployment/starships-app -n starships-prod
```

### Hour 4: Verify and Access

#### 4.1 Get Load Balancer IP
```bash
# Get external IP (may take 2-3 minutes to provision)
kubectl get svc starships-service -n starships-prod

# Output example:
# NAME                TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)
# starships-service   LoadBalancer   10.245.0.100    167.99.123.45    80:30123/TCP
```

#### 4.2 Test Application
```bash
# Test frontend
curl http://YOUR_EXTERNAL_IP

# Test API health
curl http://YOUR_EXTERNAL_IP:4000/health

# Open in browser
open http://YOUR_EXTERNAL_IP
```

## Day 2: Automation Setup (2 Hours)

### Hour 1: GitHub Secrets Configuration

Add the following secrets to your GitHub repository:
1. Go to: Settings → Secrets and variables → Actions
2. Click "New repository secret" for each:

| Secret Name | Value | Description | Required |
|------------|-------|-------------|----------|
| `DIGITALOCEAN_ACCESS_TOKEN` | `dop_v1_...` | DO API token from Step 1.2 | ✅ Yes |
| `NEO4J_PASSWORD` | `your-secure-[DEFAULT-PASSWORD]` | Create a strong [DEFAULT-PASSWORD] | ✅ Yes |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key | ✅ Yes |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key | ✅ Yes |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe secret key | ⚠️ Optional |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe webhook secret | ⚠️ Optional |

**Note:** GitHub automatically provides `GITHUB_TOKEN` for the workflow, so you don't need to create a separate PAT for GitHub Actions. However, you still need a PAT for manual deployment (Step 3.3).

### Hour 2: GitHub Actions Workflow

Create `.github/workflows/deploy-to-digitalocean.yml`:

```yaml
name: Deploy to DigitalOcean Kubernetes

on:
  workflow_run:
    workflows: ["Build and Publish Docker Image"]
    types:
      - completed
    branches:
      - main
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Docker image tag to deploy'
        required: false
        default: 'latest'

env:
  CLUSTER_NAME: starships-prod
  NAMESPACE: starships-prod
  REGISTRY: ghcr.io
  IMAGE_NAME: theingenuityco/starships.ai

jobs:
  deploy:
    name: Deploy to DigitalOcean
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      - name: Save DigitalOcean kubeconfig
        run: doctl kubernetes cluster kubeconfig save ${{ env.CLUSTER_NAME }}

      - name: Create namespace if not exists
        run: |
          kubectl create namespace ${{ env.NAMESPACE }} --dry-run=client -o yaml | kubectl apply -f -

      - name: Update image pull secret
        run: |
          kubectl create secret docker-registry ghcr-pull-secret \
            --docker-server=ghcr.io \
            --docker-username=${{ github.actor }} \
            --docker-[DEFAULT-PASSWORD]=${{ secrets.GITHUB_TOKEN }} \
            --docker-email=${{ github.actor }}@users.noreply.github.com \
            --namespace=${{ env.NAMESPACE }} \
            --dry-run=client -o yaml | kubectl apply -f -

      - name: Update application secrets
        run: |
          kubectl create secret generic starships-secrets \
            --from-literal=NEO4J_PASSWORD="${{ secrets.NEO4J_PASSWORD }}" \
            --from-literal=OPENAI_API_KEY="${{ secrets.OPENAI_API_KEY }}" \
            --from-literal=ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}" \
            --from-literal=STRIPE_SECRET_KEY="${{ secrets.STRIPE_SECRET_KEY }}" \
            --from-literal=STRIPE_WEBHOOK_SECRET="${{ secrets.STRIPE_WEBHOOK_SECRET }}" \
            --namespace=${{ env.NAMESPACE }} \
            --dry-run=client -o yaml | kubectl apply -f -

      - name: Determine image tag
        id: image
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            TAG="${{ github.event.inputs.image_tag }}"
          else
            TAG="latest"
          fi
          echo "tag=${TAG}" >> $GITHUB_OUTPUT
          echo "Using image tag: ${TAG}"

      - name: Deploy or Update Application
        run: |
          # Check if deployment exists
          if kubectl get deployment starships-app -n ${{ env.NAMESPACE }} >/dev/null 2>&1; then
            echo "Updating existing deployment..."
            kubectl set image deployment/starships-app \
              starships=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.image.outputs.tag }} \
              --namespace=${{ env.NAMESPACE }}
          else
            echo "Creating new deployment..."
            # Apply all configurations
            kubectl apply -f do-deployment/
          fi
          
          # Wait for rollout to complete
          kubectl rollout status deployment/starships-app \
            --namespace=${{ env.NAMESPACE }} \
            --timeout=10m

      - name: Verify deployment
        run: |
          echo "## 🚀 Deployment Status" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          
          echo "### Deployment:" >> $GITHUB_STEP_SUMMARY
          kubectl get deployment -n ${{ env.NAMESPACE }} >> $GITHUB_STEP_SUMMARY
          
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Pods:" >> $GITHUB_STEP_SUMMARY
          kubectl get pods -n ${{ env.NAMESPACE }} >> $GITHUB_STEP_SUMMARY
          
          # Get Load Balancer IP
          LB_IP=$(kubectl get svc starships-service -n ${{ env.NAMESPACE }} -o jsonpath='{.status.loadBalancer.ingress[0].ip}' || echo "pending")
          
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Access URLs:" >> $GITHUB_STEP_SUMMARY
          echo "- **Load Balancer IP:** http://${LB_IP}" >> $GITHUB_STEP_SUMMARY
          echo "- **API Health:** http://${LB_IP}:4000/health" >> $GITHUB_STEP_SUMMARY
          
          # Also output to console
          echo "🌐 Application URL: http://${LB_IP}"
```

## Optional Enhancements

### SSL/TLS with Let's Encrypt

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: [LETSENCRYPT-API]/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Domain Configuration

1. Point your domain to the Load Balancer IP
2. Create an Ingress resource:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-prod
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: starships-tls
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-service
            port:
              number: 80
```

## Cost Optimization Tips

### Option 1: Skip Load Balancer Initially
Use NodePort service instead of LoadBalancer to save $12/month:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: starships-service
spec:
  type: NodePort
  ports:
  - port: 80
    targetPort: 3000
    nodePort: 30080  # Access via node-ip:30080
```

### Option 2: Use Spot/Preemptible Nodes
Not available on DigitalOcean, but consider if moving to GCP/AWS.

### Option 3: Scale to Zero During Development
```bash
# Scale down when not testing
kubectl scale deployment starships-app --replicas=0 -n starships-prod

# Scale up when needed
kubectl scale deployment starships-app --replicas=1 -n starships-prod
```

## Monitoring and Maintenance

### Basic Monitoring
```bash
# Note: kubectl top requires metrics-server (optional for MVP)
# Install metrics-server if needed:
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Resource usage (after metrics-server installed)
kubectl top nodes
kubectl top pods -n starships-prod

# Without metrics-server, check resource requests/limits
kubectl describe pods -n starships-prod | grep -A 3 "Limits:"

# Logs (most important for debugging)
kubectl logs -f deployment/starships-app -n starships-prod

# Recent events
kubectl get events -n starships-prod --sort-by='.lastTimestamp'

# Watch pod status in real-time
kubectl get pods -n starships-prod -w
```

### DigitalOcean Monitoring
- Enable monitoring in cluster settings (free)
- View metrics in DO dashboard
- Set up alerts for high CPU/memory usage

### Backup Strategy
```bash
# Backup secrets
kubectl get secret starships-secrets -n starships-prod -o yaml > secrets-backup.yaml

# Backup persistent data
kubectl exec -n starships-prod deployment/starships-app -- tar czf - /var/lib/neo4j/data > neo4j-backup.tar.gz
```

## Troubleshooting

### Pod Not Starting
```bash
# Check pod status
kubectl describe pod <pod-name> -n starships-prod

# Check logs
kubectl logs <pod-name> -n starships-prod --previous

# Common issues:
# - ImagePullBackOff: Check GitHub PAT token and ghcr-pull-secret
# - CrashLoopBackOff: Check logs for startup errors
# - Pending: Check node resources or PVC binding
```

### Image Pull Errors (Private Registry)
```bash
# Verify secret exists
kubectl get secret ghcr-pull-secret -n starships-prod

# Recreate with correct PAT
kubectl delete secret ghcr-pull-secret -n starships-prod
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-[DEFAULT-PASSWORD]=YOUR_NEW_PAT \
  --namespace=starships-prod

# Restart pod to pull image
kubectl rollout restart deployment/starships-app -n starships-prod
```

### Out of Memory
```bash
# Check current usage
kubectl top pods -n starships-prod

# Check node resources
kubectl describe node

# Option 1: Reduce memory limits
kubectl edit deployment starships-app -n starships-prod
# Change limits.memory from 3Gi to 2Gi

# Option 2: Upgrade node size (takes ~5 minutes)
doctl kubernetes node-pool list --cluster starships-prod
doctl kubernetes node-pool update <pool-id> --size s-2vcpu-8gb
```

### Load Balancer Not Getting IP
```bash
# Check service events
kubectl describe svc starships-service -n starships-prod

# Check if LB annotations are correct
kubectl get svc starships-service -n starships-prod -o yaml

# Recreate if stuck
kubectl delete svc starships-service -n starships-prod
kubectl apply -f do-deployment/service.yaml

# Alternative: Use NodePort temporarily
kubectl patch svc starships-service -n starships-prod -p '{"spec":{"type":"NodePort"}}'
# Access via: http://node-ip:30000-32767
```

### Health Check Failures
```bash
# Test health endpoint manually
kubectl port-forward deployment/starships-app 4000:4000 -n starships-prod
curl http://localhost:4000/health/live

# Check if Neo4j is running
kubectl exec deployment/starships-app -n starships-prod -- curl http://localhost:7474

# Increase probe timeouts if needed
kubectl edit deployment starships-app -n starships-prod
# Increase initialDelaySeconds to 240
```

### Storage Issues
```bash
# Check PVC status
kubectl get pvc -n starships-prod

# Check available storage
doctl compute volume list

# If PVC is stuck in Pending
kubectl describe pvc neo4j-data-pvc -n starships-prod

# Delete and recreate if needed
kubectl delete pvc neo4j-data-pvc -n starships-prod
kubectl apply -f do-deployment/storage.yaml
```

## Rollback Strategy

### Quick Rollback to Previous Version
```bash
# View rollout history
kubectl rollout history deployment/starships-app -n starships-prod

# Rollback to previous version
kubectl rollout undo deployment/starships-app -n starships-prod

# Rollback to specific revision
kubectl rollout undo deployment/starships-app --to-revision=2 -n starships-prod

# Monitor rollback
kubectl rollout status deployment/starships-app -n starships-prod
```

### Emergency Recovery
```bash
# If everything is broken, redeploy from scratch
kubectl delete namespace starships-prod
kubectl create namespace starships-prod

# Reapply all configurations
kubectl apply -f do-deployment/

# Restore data from backup if needed
kubectl cp neo4j-backup.tar.gz <new-pod>:/tmp/
kubectl exec <new-pod> -- tar xzf /tmp/neo4j-backup.tar.gz -C /
```

## Migration Path

### When to Scale

| Users | Setup | Cost/Month |
|-------|-------|------------|
| 10-50 | 1 node (4GB) | $36 |
| 50-100 | 2 nodes (4GB) | $60 |
| 100-500 | 3 nodes (8GB) + monitoring | $150 |
| 500+ | Consider managed services | $300+ |

### Scaling Commands
```bash
# Add more nodes
doctl kubernetes node-pool create \
  --cluster starships-prod \
  --name workers \
  --size s-2vcpu-4gb \
  --count 2

# Scale deployment replicas
kubectl scale deployment starships-app --replicas=3 -n starships-prod

# Enable autoscaling
kubectl autoscale deployment starships-app \
  --min=1 --max=5 --cpu-percent=80 \
  -n starships-prod
```

## Common Mistakes to Avoid

1. **Using wrong health check endpoints**: Use `/health/live` and `/health/ready`, not just `/health`
2. **Forgetting GitHub PAT for private registry**: Your GHCR is private, PAT is required
3. **Not waiting for resources**: PVCs and Load Balancers take 2-3 minutes to provision
4. **Insufficient memory limits**: Neo4j needs at least 1.5GB, set container limit to 3GB
5. **Using GITHUB_TOKEN for manual deployment**: Use PAT for kubectl, GITHUB_TOKEN only works in Actions
6. **Not checking logs when pods fail**: Always check `kubectl logs` before assuming it's a resource issue
7. **Deploying without testing locally**: Test your Docker image locally first
8. **Not backing up before major changes**: Always backup Neo4j data before upgrades

## Summary

This deployment strategy provides:
- **Quick deployment**: Running in under 4 hours
- **Low cost**: ~$40/month for complete setup
- **Simple management**: No complex tools or orchestration
- **Easy scaling**: Can grow with your user base
- **Production ready**: Includes health checks, monitoring, and backups

The architecture is optimized for MVP validation while maintaining a clear path to scale as your user base grows.

## Next Steps

1. Complete Day 1 deployment
2. Test with initial users
3. Set up GitHub Actions automation
4. Add domain and SSL when ready
5. Monitor usage and scale as needed

Remember: Start simple, add complexity only when required by actual usage.