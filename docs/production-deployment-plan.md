# Production Deployment Plan for Starships.ai

## 📊 Live Deployment Status Tracker

### Overall Progress: ![](https://progress-bar.dev/65/?title=Overall&width=300&color=blue)

| Phase | Status | Progress | Last Updated | Notes |
|-------|--------|----------|--------------|-------|
| **Phase 1: Security Hardening** | 🟢 Completed | ![](https://progress-bar.dev/100/) | 2025-08-26 | Remove secrets ✅, Neo4j pwd ✅, Kinde OAuth app pending manual setup |
| **Phase 2: Infrastructure Setup** | 🟢 Completed | ![](https://progress-bar.dev/100/) | 2025-08-26 | Cluster created ✅, NGINX ✅, cert-manager ✅, LB IP: [HARDCODED-IP] |
| **Phase 3: DNS Configuration** | 🟡 In Progress | ![](https://progress-bar.dev/0/) | 2025-08-26 | Load Balancer IP ready: [HARDCODED-IP] |
| **Phase 4: GitHub Secrets** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | - | Setup production environment |
| **Phase 5: K8s Manifests** | 🟢 Completed | ![](https://progress-bar.dev/100/) | 2025-08-26 | All manifests created ✅ |
| **Phase 6: CI/CD Workflow** | 🟢 Completed | ![](https://progress-bar.dev/100/) | 2025-08-26 | Workflows created for dev & prod ✅ |
| **Phase 7: Monitoring** | 🟡 In Progress | ![](https://progress-bar.dev/60/) | 2025-08-26 | Metrics server ✅, monitoring config ✅ |
| **Phase 8: Backup & DR** | 🟡 In Progress | ![](https://progress-bar.dev/50/) | 2025-08-26 | Backup scripts ✅, CronJob ✅, Rollback script ✅ |
| **Phase 9: Security Audit** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | - | Final security checks |

### Legend
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⚠️ Blocked
- 🔄 Needs Review

---

## Overview
This document outlines the complete plan for deploying Starships.ai to a production Kubernetes cluster on Digital Ocean, with enhanced security, reliability, and scalability compared to the development environment.

### 📌 Key Decisions Made (Updated)
- **GitHub Environment**: Using existing `prod` environment (not creating new `production`)
- **Cluster Configuration**: Single node in `nyc1` region (~$60/month)
- **Storage**: 5GB for Neo4j, 1GB for sessions (matching dev)
- **SSL Contact**: dewang@theingenuity.co
- **Kinde OAuth**: Production app configured with callbacks for starships.ai
- **Neo4j**: Authentication will be ENABLED (requires testing!)
- **Secrets**: All stored in GitHub `prod` environment, nothing hardcoded
- **DNS**: Expect 2-4 hours propagation when switching from dev to prod

## Current State Analysis

### Architecture
- **Deployment Model**: Fat container approach (Frontend + Backend + Neo4j in single container)
- **Process Management**: Supervisor managing multiple processes within container
- **Dev Environment**: Running on Digital Ocean Kubernetes at `dev.starships.ai`
- **Domain Provider**: Namecheap
- **Container Registry**: GitHub Container Registry (ghcr.io)
- **CI/CD**: GitHub Actions with automated deployment to dev
- **Database**: Embedded Neo4j Community Edition 5.13.0

### ⚠️ Critical Security Issues Identified
1. **Hardcoded secrets in repository** (Kinde OAuth credentials)
2. **Neo4j authentication disabled** in current configuration
3. **Debug modes enabled** in production configs
4. **Auth testing backdoor** enabled in production
5. **No secret rotation strategy**
6. **No network policies** for pod isolation

## Production Architecture

### Infrastructure Design
- **Production Domain**: `starships.ai` (apex domain) + `www.starships.ai`
- **Dev Domain**: `dev.starships.ai` (existing)
- **Production Cluster**: New dedicated K8s cluster `starships-prod` on Digital Ocean
- **Namespace**: `starships-prod`
- **GitHub Environment**: `production` (new, with approval requirements)

### Recommended Cluster Specifications

#### Option 1: Cost-Optimized (Recommended for Start)
- **Nodes**: 2 nodes for basic HA
- **Node Size**: s-2vcpu-4gb ($48/month per node)
- **Total Cost**: ~$96/month for nodes
- **Load Balancer**: Small ($12/month)
- **Storage**: 40GB block storage ($4/month)
- **Estimated Total**: ~$112/month

#### Option 2: Performance-Optimized
- **Nodes**: 3 nodes for better HA
- **Node Size**: s-4vcpu-8gb ($96/month per node)
- **Total Cost**: ~$288/month for nodes
- **Load Balancer**: Medium ($24/month)
- **Storage**: 100GB block storage ($10/month)
- **Estimated Total**: ~$322/month

### Architecture Decision Points

#### Database Strategy Options

**Option A: Keep Embedded Neo4j (Current Approach)**
- ✅ Pros: Simple deployment, no additional costs, works well for moderate load
- ❌ Cons: Scaling limitations, backup complexity, single point of failure
- 📊 Best for: <1000 daily active users, <100GB data

**Option B: Separate Neo4j Pod**
- ✅ Pros: Better resource isolation, independent scaling, easier backups
- ❌ Cons: More complex deployment, network latency
- 📊 Best for: 1000-10000 daily active users

**Option C: Neo4j Aura (Managed Cloud)**
- ✅ Pros: Fully managed, automatic backups, high availability
- ❌ Cons: Additional cost ($65+/month), external dependency
- 📊 Best for: Production-grade reliability, compliance requirements

## Implementation Steps

### Phase 1: Security Hardening (Day 1) 🔒

#### ⚠️ CRITICAL: Neo4j Authentication Testing Required
**Before proceeding to production**, you must test Neo4j with authentication enabled:
1. The dev environment currently has Neo4j auth DISABLED
2. Production will have auth ENABLED with [DEFAULT-PASSWORD]
3. Your application code may need updates to handle authentication
4. Test this in a staging environment first!

#### 📋 Phase 1 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Remove hardcoded secrets from repo | 🟢 | DevOps | 2025-08-26 |
| Generate secure Neo4j [DEFAULT-PASSWORD] | 🟢 | DevOps | 2025-08-26 |
| Create production Kinde OAuth app | 🔴 | - | - |
| Update .gitignore for secrets | 🟢 | DevOps | 2025-08-26 |
| Verify no secrets in Git history | 🔴 | - | - |

#### Step 1.1: Remove Hardcoded Secrets
```bash
# Remove all hardcoded secrets from repository
git rm do-deployment/kinde-secret*.yaml
git rm do-deployment/new-kinde-secret.yaml

# Create .gitignore entries
echo "*.secret.yaml" >> .gitignore
echo "secrets/" >> .gitignore
```

#### Step 1.2: Generate Secure Neo4j Password
```bash
# Generate strong [DEFAULT-PASSWORD] for Neo4j
NEO4J_PASSWORD=$(openssl rand -base64 32)
echo "Save this [DEFAULT-PASSWORD] securely: $NEO4J_PASSWORD"
```

#### Step 1.3: Create Production Kinde OAuth App
1. Go to Kinde dashboard
2. Create new OAuth application for production
3. Set allowed callbacks:
   - `[PROD-DOMAIN-URL]/api/auth/kinde_callback`
   - `https://www.starships.ai/api/auth/kinde_callback`
4. Save credentials securely (never commit to Git)

### Phase 2: Infrastructure Setup (Day 2) 🏗️

#### 📋 Phase 2 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Create DO Kubernetes cluster | 🔴 | - | - |
| Configure cluster autoscaling | 🔴 | - | - |
| Install NGINX Ingress Controller | 🔴 | - | - |
| Install cert-manager | 🔴 | - | - |
| Get Load Balancer IP | 🔴 | - | - |
| Verify controller readiness | 🔴 | - | - |

#### Step 2.1: Create Production Kubernetes Cluster

```bash
# Get current dev cluster region
doctl kubernetes cluster get starships-dev --format Region

# Create production cluster (adjust region as needed)
doctl kubernetes cluster create starships-prod \
  --region nyc1 \
  --size s-2vcpu-4gb \
  --count 1 \
  --auto-upgrade

# Save kubeconfig
doctl kubernetes cluster kubeconfig save starships-prod
```

#### Step 2.2: Install Required Controllers

```bash
# Switch to production context
kubectl config use-context do-nyc3-starships-prod

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/do/deploy.yaml

# Wait for ingress to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Get Load Balancer IP (save this for DNS)
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

#### Step 2.3: Install cert-manager for SSL

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s
```

### Phase 3: DNS Configuration (Day 2) 🌐

#### 📋 Phase 3 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Update A record for @ | 🔴 | - | - |
| Update A record for www | 🔴 | - | - |
| Configure API CNAME | 🔴 | - | - |
| Verify DNS propagation | 🔴 | - | - |
| Test SSL certificate | 🔴 | - | - |

#### Step 3.1: Configure Namecheap DNS

1. Log into Namecheap Dashboard
2. Navigate to Domain List → Manage → Advanced DNS
3. Configure these records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | `<production-load-balancer-ip>` | 1 min |
| A | www | `<production-load-balancer-ip>` | 1 min |
| A | dev | `<keep-existing-dev-ip>` | Automatic |
| CNAME | api | `starships.ai` | 1 min |

#### Step 3.2: Verify DNS Propagation

```bash
# Test DNS resolution
dig starships.ai +short
dig www.starships.ai +short

# Test from multiple locations
curl -I [DNS-CHECK-SERVICE]/api/details?server=[DNS-SERVER-IP]&type=A&query=starships.ai
```

### Phase 4: GitHub Secrets Configuration (Day 3) 🔐

#### 📋 Phase 4 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Create production environment | 🔴 | - | - |
| Add infrastructure secrets | 🔴 | - | - |
| Add application secrets | 🔴 | - | - |
| Configure Kinde OAuth secrets | 🔴 | - | - |
| Set environment protection rules | 🔴 | - | - |
| Test secret access | 🔴 | - | - |

#### Step 4.1: Use Existing Production Environment

1. Go to GitHub Repository → Settings → Environments
2. Use existing `prod` environment (NOT creating new `production`)
3. Verify protection rules:
   - ✅ Required reviewers: Add yourself and team leads
   - ✅ Deployment branches: Only from `main` branch
   - ✅ Wait timer: 5 minutes (optional)

#### Step 4.2: Add Production Secrets

Navigate to Settings → Environments → `prod` → Add Secret for each:

**🔴 MANUAL ACTION REQUIRED - Add these secrets to GitHub 'prod' environment:**

**Infrastructure Secrets:**
```yaml
DIGITALOCEAN_ACCESS_TOKEN: <use-same-token-as-dev-environment>
RELEASE_TOKEN: <use-existing-github-pat-with-repo-permissions>
GHCR_TOKEN: <use-existing-github-pat-with-packages-write>
```

**Application Secrets:**
```yaml
# API Keys (copy from dev or generate new production keys)
OPENAI_API_KEY: <copy-from-dev-or-generate-production-key>
ANTHROPIC_API_KEY: <copy-from-dev-or-generate-production-key>

# Stripe (Use Production Mode Keys from Stripe Dashboard)
STRIPE_SECRET_KEY: sk_live_xxx
STRIPE_PUBLISHABLE_KEY: pk_live_xxx
STRIPE_WEBHOOK_SECRET: whsec_xxx

# Database (CRITICAL - Use this exact [DEFAULT-PASSWORD])
NEO4J_PASSWORD: [NEO4J-PASSWORD]
NEO4J_USERNAME: neo4j

# Kinde OAuth (Production - Already Provided)
KINDE_CLIENT_ID: [KINDE-PROD-CLIENT-ID]
KINDE_CLIENT_SECRET: [API-KEY]
KINDE_ISSUER_URL: [KINDE-ISSUER-URL]
```

**Environment Variables (Also add as secrets):**
```yaml
KINDE_SITE_URL: [PROD-DOMAIN-URL]
KINDE_POST_LOGIN_REDIRECT_URL: [PROD-DOMAIN-URL]/fleet
KINDE_POST_LOGOUT_REDIRECT_URL: [PROD-DOMAIN-URL]
```

### Phase 5: Kubernetes Manifests Creation (Day 3) 📦

#### 📋 Phase 5 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Create directory structure | 🔴 | - | - |
| Create namespace manifest | 🔴 | - | - |
| Create secrets templates | 🔴 | - | - |
| Create PVC manifests | 🔴 | - | - |
| Create deployment manifest | 🔴 | - | - |
| Create service manifest | 🔴 | - | - |
| Create ingress manifest | 🔴 | - | - |
| Create HPA manifest | 🔴 | - | - |
| Create network policy | 🔴 | - | - |
| Create PDB manifest | 🔴 | - | - |
| Validate all manifests | 🔴 | - | - |

#### Step 5.1: Create Directory Structure

```bash
# Create production manifests directory
mkdir -p k8s/prod
cd k8s/prod
```

#### Step 5.2: Namespace Configuration

Create `k8s/prod/00-namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: starships-prod
  labels:
    environment: production
    app: starships-ai
```

#### Step 5.3: Create Secrets Templates

Create `k8s/prod/01-secrets.yaml` (DO NOT COMMIT WITH REAL VALUES):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: starships-secrets
  namespace: starships-prod
type: Opaque
stringData:
  # API Keys
  OPENAI_API_KEY: "REPLACE_ME"
  ANTHROPIC_API_KEY: "REPLACE_ME"
  
  # Stripe
  STRIPE_SECRET_KEY: "REPLACE_ME"
  STRIPE_PUBLISHABLE_KEY: "REPLACE_ME"
  STRIPE_WEBHOOK_SECRET: "REPLACE_ME"
  
  # Neo4j
  NEO4J_PASSWORD: "REPLACE_ME"
---
apiVersion: v1
kind: Secret
metadata:
  name: kinde-auth-secret
  namespace: starships-prod
type: Opaque
stringData:
  KINDE_CLIENT_ID: "REPLACE_ME"
  KINDE_CLIENT_SECRET: "REPLACE_ME"
  KINDE_ISSUER_URL: "REPLACE_ME"
---
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-pull-secret
  namespace: starships-prod
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: "REPLACE_ME_BASE64"
```

#### Step 5.4: Persistent Volume Claims

Create `k8s/prod/02-pvc.yaml`:

```yaml
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
      storage: 40Gi
  storageClassName: do-block-storage
---
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

#### Step 5.5: Production Deployment

Create `k8s/prod/03-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: starships-app
  namespace: starships-prod
  labels:
    app: starships-ai
    environment: production
spec:
  replicas: 2
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: starships-ai
      environment: production
  template:
    metadata:
      labels:
        app: starships-ai
        environment: production
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
    spec:
      # Security Context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      
      # Anti-affinity for HA
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - starships-ai
              topologyKey: kubernetes.io/hostname
      
      imagePullSecrets:
      - name: ghcr-pull-secret
      
      containers:
      - name: starships
        image: [DOCKER-REGISTRY-URL]:latest
        imagePullPolicy: Always
        
        ports:
        - containerPort: 3000
          name: frontend
          protocol: TCP
        - containerPort: 4000
          name: backend
          protocol: TCP
        - containerPort: 7474
          name: neo4j-http
          protocol: TCP
        - containerPort: 7687
          name: neo4j-bolt
          protocol: TCP
        
        # Production Environment Variables
        env:
        # Core Settings
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: SKIP_BUILD
          value: "true"
        - name: SKIP_INSTALL
          value: "true"
        
        # URLs
        - name: CLIENT_URL
          value: "[PROD-DOMAIN-URL]"
        - name: NEXT_PUBLIC_API_URL
          value: "[PROD-DOMAIN-URL]/api"
        - name: SERVER_URL
          value: "http://localhost:4000"
        
        # Neo4j Configuration (with auth enabled)
        - name: NEO4J_URI
          value: "[NEO4J-LOCAL-URL]"
        - name: NEO4J_USERNAME
          value: "neo4j"
        - name: NEO4J_PASSWORD
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: NEO4J_PASSWORD
        - name: NEO4J_AUTH
          value: "neo4j/$(NEO4J_PASSWORD)"
        
        # Kinde OAuth
        - name: KINDE_SITE_URL
          value: "[PROD-DOMAIN-URL]"
        - name: KINDE_POST_LOGIN_REDIRECT_URL
          value: "[PROD-DOMAIN-URL]/fleet"
        - name: KINDE_POST_LOGOUT_REDIRECT_URL
          value: "[PROD-DOMAIN-URL]"
        - name: KINDE_COOKIE_DOMAIN
          value: ".starships.ai"
        - name: KINDE_REDIRECT_URL
          value: "[PROD-DOMAIN-URL]/api/auth/kinde_callback"
        
        # Security: Disable debug modes
        - name: NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR
          value: "false"
        - name: KINDE_DEBUG_MODE
          value: "false"
        
        # API Keys from Secrets
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: OPENAI_API_KEY
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: ANTHROPIC_API_KEY
        - name: STRIPE_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: STRIPE_SECRET_KEY
        - name: STRIPE_WEBHOOK_SECRET
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: STRIPE_WEBHOOK_SECRET
        - name: STRIPE_PUBLISHABLE_KEY
          valueFrom:
            secretKeyRef:
              name: starships-secrets
              key: STRIPE_PUBLISHABLE_KEY
        
        # Pull Kinde secrets
        envFrom:
        - secretRef:
            name: kinde-auth-secret
        
        # Resource Limits
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "3Gi"
            cpu: "1500m"
        
        # Health Checks
        livenessProbe:
          httpGet:
            path: /api/health
            port: 4000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /api/health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          successThreshold: 1
          failureThreshold: 3
        
        # Startup Probe for slow starts
        startupProbe:
          httpGet:
            path: /api/health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 30
        
        # Volume Mounts
        volumeMounts:
        - name: neo4j-data
          mountPath: /var/lib/neo4j/data
        - name: app-sessions
          mountPath: /app/data/sessions
        
      # Volumes
      volumes:
      - name: neo4j-data
        persistentVolumeClaim:
          claimName: neo4j-data-pvc
      - name: app-sessions
        persistentVolumeClaim:
          claimName: sessions-pvc
```

#### Step 5.6: Service Configuration

Create `k8s/prod/04-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: starships-service
  namespace: starships-prod
  labels:
    app: starships-ai
    environment: production
spec:
  type: ClusterIP
  selector:
    app: starships-ai
    environment: production
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  - port: 4000
    targetPort: 4000
    protocol: TCP
    name: api
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
```

#### Step 5.7: Ingress Configuration

Create `k8s/prod/05-ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-prod
  annotations:
    # SSL
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    
    # Performance
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    
    # Security Headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: SAMEORIGIN";
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "X-XSS-Protection: 1; mode=block";
      more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";
    
    # Rate Limiting
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-connections: "50"
    
    # API routing
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - starships.ai
    - www.starships.ai
    secretName: starships-tls-cert
  rules:
  - host: starships.ai
    http:
      paths:
      - path: /api(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: starships-service
            port:
              number: 4000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-service
            port:
              number: 80
  - host: www.starships.ai
    http:
      paths:
      - path: /api(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: starships-service
            port:
              number: 4000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-service
            port:
              number: 80
```

#### Step 5.8: Let's Encrypt Issuer

Create `k8s/prod/06-letsencrypt-issuer.yaml`:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: [LETSENCRYPT-API]/directory
    email: dewang@theingenuity.co  # SSL certificate contact
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
    - http01:
        ingress:
          class: nginx
---
# Staging issuer for testing
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: dewang@theingenuity.co  # SSL certificate contact
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
    - http01:
        ingress:
          class: nginx
```

#### Step 5.9: Horizontal Pod Autoscaler

Create `k8s/prod/07-hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: starships-hpa
  namespace: starships-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: starships-app
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
```

#### Step 5.10: Network Policy

Create `k8s/prod/08-network-policy.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: starships-network-policy
  namespace: starships-prod
spec:
  podSelector:
    matchLabels:
      app: starships-ai
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
    - protocol: TCP
      port: 4000
  egress:
  - to:
    - podSelector: {}
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 80
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

#### Step 5.11: Pod Disruption Budget

Create `k8s/prod/09-pdb.yaml`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: starships-pdb
  namespace: starships-prod
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: starships-ai
      environment: production
```

### Phase 6: CI/CD Workflow Configuration (Day 4) 🚀

#### 📋 Phase 6 Overall Task Tracker
| Task Category | Status | Progress | Details |
|---------------|--------|----------|----------|
| **Deployment Strategy** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | Branch strategy & versioning |
| **GitHub Workflow Updates** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | Modify release workflow |
| **Production Controls** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | Approvals & protection |
| **Testing & Validation** | 🔴 Not Started | ![](https://progress-bar.dev/0/) | Pipeline verification |

#### 📌 Deployment Strategy Configuration
| Task | Status | Owner | Completion Date | Notes |
|------|--------|-------|-----------------|---------|
| Document deployment flow (dev vs prod) | 🔴 | - | - | main → dev, releases → prod |
| Keep semantic-release for dev | 🔴 | - | - | Auto-versioning on main |
| Configure release-based prod deployment | 🔴 | - | - | Deploy on GitHub releases |
| Document version sync strategy | 🔴 | - | - | Handle v3.6.1 vs v3.1.6 mismatch |
| Create deployment decision matrix | 🔴 | - | - | When to deploy what |

#### Step 6.1: Configure Deployment Strategy

##### 6.1.1: Deployment Flow Architecture

**Current State:**
- Every push to `main` → Auto-versions → Deploys to `dev.starships.ai`
- Using `semantic-release` for automatic versioning
- Version mismatch: package.json (3.6.1) vs git tag (v3.1.6)

**Target State:**
```yaml
Development Flow (unchanged):
  Push to main → semantic-release → v3.7.0 → dev.starships.ai
  
Production Flow (new):
  GitHub Release published/edited → Deploy v3.7.0 → starships.ai
```

##### 6.1.2: Implementation Tasks

| Subtask | Status | Progress | Command/Action |
|---------|--------|----------|----------------|
| Verify semantic-release config | 🔴 | ![](https://progress-bar.dev/0/) | Check `.releaserc` |
| Add release trigger to workflow | 🔴 | ![](https://progress-bar.dev/0/) | Add `release: [published]` |
| Add deployment conditions | 🔴 | ![](https://progress-bar.dev/0/) | `if: github.event_name == 'release'` |
| Configure environment routing | 🔴 | ![](https://progress-bar.dev/0/) | Dev vs Prod logic |
| Test version propagation | 🔴 | ![](https://progress-bar.dev/0/) | Ensure tags match |

##### 6.1.3: Update Main Release Workflow

Modify `.github/workflows/release-and-publish.yml` to add production deployment:

```yaml
# Add release trigger to existing workflow
on:
  push:
    branches: [main]  # Existing: auto-deploy to dev
  release:
    types: [published, edited]  # NEW: trigger production deployment
  workflow_dispatch:  # Keep manual trigger option

# Modify deployment job to handle both environments
jobs:
  # ... existing version and docker jobs ...
  
  # Update existing deploy job to handle dev
  deploy-to-dev:
    name: Deploy to Development
    needs: [version, docker]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: development
      url: [DEV-DOMAIN-URL]
    steps:
      # ... existing dev deployment steps ...
  
  # Add new production deployment job
  deploy-to-production:
    name: Deploy to Production
    needs: [version, docker, release]
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    environment: 
      name: production
      url: [PROD-DOMAIN-URL]
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      - name: Setup Production Kubernetes
        run: |
          doctl kubernetes cluster kubeconfig save starships-prod
          kubectl config use-context do-nyc3-starships-prod
          
      - name: Create/Update Secrets
        run: |
          # Create namespace if not exists
          kubectl create namespace starships-prod --dry-run=client -o yaml | kubectl apply -f -
          
          # Delete and recreate secrets
          kubectl delete secret starships-secrets -n starships-prod --ignore-not-found=true
          kubectl delete secret kinde-auth-secret -n starships-prod --ignore-not-found=true
          
          # Create API secrets
          kubectl create secret generic starships-secrets \
            --from-literal=OPENAI_API_KEY="${{ secrets.OPENAI_API_KEY }}" \
            --from-literal=ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}" \
            --from-literal=STRIPE_SECRET_KEY="${{ secrets.STRIPE_SECRET_KEY }}" \
            --from-literal=STRIPE_WEBHOOK_SECRET="${{ secrets.STRIPE_WEBHOOK_SECRET }}" \
            --from-literal=STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY }}" \
            --from-literal=NEO4J_PASSWORD="${{ secrets.NEO4J_PASSWORD }}" \
            -n starships-prod
          
          # Create Kinde secrets
          kubectl create secret generic kinde-auth-secret \
            --from-literal=KINDE_CLIENT_ID="${{ secrets.KINDE_CLIENT_ID }}" \
            --from-literal=KINDE_CLIENT_SECRET="${{ secrets.KINDE_CLIENT_SECRET }}" \
            --from-literal=KINDE_ISSUER_URL="${{ secrets.KINDE_ISSUER_URL }}" \
            -n starships-prod

      - name: Deploy to Production
        run: |
          # Apply all manifests
          kubectl apply -f k8s/prod/
          
          # Update deployment with new image
          IMAGE_NAME_LOWER=$(echo ${{ github.repository }} | tr '[:upper:]' '[:lower:]')
          kubectl set image deployment/starships-app \
            starships=ghcr.io/${IMAGE_NAME_LOWER}:${{ needs.version.outputs.new_release_version }} \
            -n starships-prod
          
          # Wait for rollout
          kubectl rollout status deployment/starships-app -n starships-prod --timeout=600s

      - name: Verify Production Deployment
        run: |
          # Check pod status
          kubectl get pods -n starships-prod
          
          # Verify endpoints
          kubectl get endpoints -n starships-prod
          
          # Check service
          kubectl get svc -n starships-prod
          
          # Test health endpoint
          sleep 30
          INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
          curl -f -k https://${INGRESS_IP}/api/health -H "Host: starships.ai" || echo "Health check pending DNS propagation"

      - name: Production Smoke Test
        continue-on-error: true
        run: |
          # Wait for DNS and SSL
          sleep 60
          
          # Test main domain
          curl -I [PROD-DOMAIN-URL] || true
          
          # Test API endpoint
          curl -I [PROD-DOMAIN-URL]/api/health || true
```

#### Step 6.2: Production Deployment Workflow Tasks

##### 📋 Production Workflow Task Tracker
| Task | Status | Progress | Validation |
|------|--------|----------|------------|
| Create production environment in GitHub | 🔴 | ![](https://progress-bar.dev/0/) | Check Settings → Environments |
| Add approval requirements | 🔴 | ![](https://progress-bar.dev/0/) | Set reviewers |
| Configure branch protection | 🔴 | ![](https://progress-bar.dev/0/) | Main branch only |
| Add environment secrets | 🔴 | ![](https://progress-bar.dev/0/) | All prod secrets |
| Test workflow triggers | 🔴 | ![](https://progress-bar.dev/0/) | Dry run |
| Verify image versioning | 🔴 | ![](https://progress-bar.dev/0/) | Correct tags |
| Test rollback procedure | 🔴 | ![](https://progress-bar.dev/0/) | Previous version |

#### Step 6.3: Create Manual Production Deployment

Create `.github/workflows/deploy-production-manual.yml`

```yaml
name: Manual Production Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Docker image version to deploy (e.g., 3.7.0)'
        required: true
        type: string
      skip_approval:
        description: 'Skip manual approval (emergency deployments)'
        required: false
        type: boolean
        default: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: 
      name: production
      url: [PROD-DOMAIN-URL]
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: v${{ github.event.inputs.version }}

      - name: Manual Approval
        if: github.event.inputs.skip_approval != 'true'
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ github.TOKEN }}
          approvers: ${{ github.repository_owner }}
          minimum-approvals: 1
          issue-title: "Production Deployment Approval Required"
          issue-body: |
            ### Production Deployment Request
            
            **Version:** ${{ github.event.inputs.version }}
            **Triggered by:** ${{ github.actor }}
            **Time:** ${{ github.event.head_commit.timestamp }}
            
            Please review and approve this production deployment.

      # Rest of deployment steps same as above...
```

#### Step 6.4: Version Synchronization Strategy

##### 📋 Version Management Tasks
| Task | Status | Priority | Action Required |
|------|--------|----------|----------------|
| Audit current version mismatch | 🔴 | High | package.json: 3.6.1, tag: v3.1.6 |
| Sync git tags with package.json | 🔴 | High | Create missing tags |
| Configure semantic-release properly | 🔴 | High | Ensure tags are created |
| Document version strategy | 🔴 | Medium | Update README |
| Create version rollback plan | 🔴 | Medium | Emergency procedures |

##### Resolution Steps:
```bash
# 1. Check current state
git describe --tags --abbrev=0  # Current: v3.1.6
cat package.json | grep version  # Current: 3.6.1

# 2. Option A: Reset to match package.json
git tag v3.6.1
git push origin v3.6.1

# 3. Option B: Let semantic-release auto-fix on next release
# Just continue with normal flow, it will self-correct
```

#### Step 6.5: Deployment Flow Summary

##### 🎯 Final Deployment Strategy

| Trigger | Environment | Version | Automatic | Approval Required |
|---------|-------------|---------|-----------|-------------------|
| Push to `main` | dev.starships.ai | Auto-increment | ✅ Yes | ❌ No |
| Create Release | starships.ai | Specific tag | ✅ Yes | ✅ Yes |
| Manual Workflow | Either | Selected | ❌ No | ✅ Yes |

##### 📊 Implementation Progress Tracker

| Phase | Tasks | Progress | Status |
|-------|-------|----------|--------|
| **Strategy Design** | 5 | ![](https://progress-bar.dev/0/) | 🔴 Not Started |
| **Workflow Updates** | 8 | ![](https://progress-bar.dev/0/) | 🔴 Not Started |
| **GitHub Configuration** | 6 | ![](https://progress-bar.dev/0/) | 🔴 Not Started |
| **Testing & Validation** | 4 | ![](https://progress-bar.dev/0/) | 🔴 Not Started |
| **Documentation** | 3 | ![](https://progress-bar.dev/0/) | 🔴 Not Started |

##### ✅ Deployment Checklist

**Pre-Implementation:**
- [ ] Review current semantic-release configuration
- [ ] Backup existing workflow files
- [ ] Document current deployment process
- [ ] Identify all environment-specific variables

**Implementation:**
- [ ] Update `.github/workflows/release-and-publish.yml`
- [ ] Create production environment in GitHub
- [ ] Configure environment protection rules
- [ ] Add all production secrets
- [ ] Update workflow with conditional deployment
- [ ] Test push to main (should deploy to dev only)
- [ ] Test release creation (should trigger prod approval)

**Post-Implementation:**
- [ ] Verify dev deployment still works
- [ ] Test production deployment with dry-run
- [ ] Document new deployment process
- [ ] Train team on new workflow
- [ ] Create emergency rollback procedure

### Phase 7: Monitoring & Observability (Day 5) 📊

#### 📋 Phase 7 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Install metrics server | 🔴 | - | - |
| Setup uptime monitoring | 🔴 | - | - |
| Configure structured logging | 🔴 | - | - |
| Create monitoring dashboards | 🔴 | - | - |
| Setup alerting rules | 🔴 | - | - |

#### Step 7.1: Install Metrics Server

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch for DigitalOcean
kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

#### Step 7.2: Setup Uptime Monitoring

Create `k8s/prod/10-monitoring.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: monitoring-config
  namespace: starships-prod
data:
  endpoints.yaml: |
    endpoints:
      - name: homepage
        url: [PROD-DOMAIN-URL]
        interval: 60
      - name: api-health
        url: [PROD-DOMAIN-URL]/api/health
        interval: 30
      - name: auth-check
        url: [PROD-DOMAIN-URL]/api/auth/me
        interval: 120
```

#### Step 7.3: Application Logging

Add structured logging configuration to deployment:

```yaml
# Add to deployment env vars
- name: LOG_LEVEL
  value: "info"
- name: LOG_FORMAT
  value: "json"
- name: ENABLE_METRICS
  value: "true"
```

### Phase 8: Backup & Disaster Recovery (Day 5) 💾

#### 📋 Phase 8 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Create backup scripts | 🔴 | - | - |
| Setup backup CronJob | 🔴 | - | - |
| Configure backup storage | 🔴 | - | - |
| Test backup restoration | 🔴 | - | - |
| Document DR procedures | 🔴 | - | - |

#### Step 8.1: Database Backup Strategy

Create `scripts/backup-neo4j.sh`:

```bash
#!/bin/bash
# Neo4j Backup Script for Production

NAMESPACE="starships-prod"
POD=$(kubectl get pods -n $NAMESPACE -l app=starships-ai -o jsonpath="{.items[0].metadata.name}")
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="neo4j-backup-$DATE"

# Create backup inside pod
kubectl exec -n $NAMESPACE $POD -- neo4j-admin database dump --to=/tmp/$BACKUP_NAME.dump neo4j

# Copy backup to local
kubectl cp $NAMESPACE/$POD:/tmp/$BACKUP_NAME.dump ./backups/$BACKUP_NAME.dump

# Upload to DigitalOcean Spaces or S3
# doctl spaces upload ./backups/$BACKUP_NAME.dump s3://starships-backups/neo4j/$BACKUP_NAME.dump

echo "Backup completed: $BACKUP_NAME.dump"
```

#### Step 8.2: Automated Backup CronJob

Create `k8s/prod/11-backup-cronjob.yaml`

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: neo4j-backup
  namespace: starships-prod
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: bitnami/kubectl:latest
            command:
            - /bin/bash
            - -c
            - |
              POD=$(kubectl get pods -n starships-prod -l app=starships-ai -o jsonpath="{.items[0].metadata.name}")
              DATE=$(date +%Y%m%d-%H%M%S)
              kubectl exec -n starships-prod $POD -- neo4j-admin database dump --to=/tmp/backup-$DATE.dump neo4j
              echo "Backup completed: backup-$DATE.dump"
          restartPolicy: OnFailure
```

#### Step 8.3: Disaster Recovery Plan

**Recovery Time Objective (RTO):** 4 hours
**Recovery Point Objective (RPO):** 24 hours

**Disaster Recovery Procedures:**

1. **Database Failure:**
   ```bash
   # Restore from backup
   kubectl cp ./backups/latest.dump starships-prod/<pod>:/tmp/restore.dump
   kubectl exec -n starships-prod <pod> -- neo4j-admin database load --from=/tmp/restore.dump --database=neo4j --force
   ```

2. **Complete Cluster Failure:**
   - Provision new cluster using terraform/doctl
   - Apply all manifests from Git
   - Restore database from backup
   - Update DNS to point to new cluster

3. **Rollback Procedure:**
   ```bash
   # List deployment history
   kubectl rollout history deployment/starships-app -n starships-prod
   
   # Rollback to previous version
   kubectl rollout undo deployment/starships-app -n starships-prod
   
   # Rollback to specific revision
   kubectl rollout undo deployment/starships-app --to-revision=<number> -n starships-prod
   ```

### Phase 9: Security Hardening (Day 6) 🔐

#### 📋 Phase 9 Task Tracker
| Task | Status | Owner | Completion Date |
|------|--------|-------|-----------------|
| Create GHCR pull secret | 🔴 | - | - |
| Run security scan | 🔴 | - | - |
| Configure RBAC | 🔴 | - | - |
| Setup secret rotation | 🔴 | - | - |
| Final security audit | 🔴 | - | - |

#### Step 9.1: Create GHCR Pull Secret

```bash
# Generate GitHub Personal Access Token with packages:read permission
# Then create pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-[DEFAULT-PASSWORD]=<github-pat> \
  --docker-email=<email> \
  -n starships-prod
```

#### Step 9.2: Security Checklist

- [ ] Remove all hardcoded secrets from repository
- [ ] Enable Neo4j authentication
- [ ] Disable debug modes in production
- [ ] Set up network policies
- [ ] Configure pod security policies
- [ ] Enable audit logging
- [ ] Set up secret rotation
- [ ] Configure RBAC properly
- [ ] Scan images for vulnerabilities
- [ ] Enable SSL/TLS everywhere

#### Step 9.3: Secret Rotation Script

Create `scripts/rotate-secrets.sh`:

```bash
#!/bin/bash
# Production Secret Rotation

NAMESPACE="starships-prod"

# Rotate Neo4j [DEFAULT-PASSWORD]
NEW_NEO4J_PASSWORD=$(openssl rand -base64 32)
kubectl patch secret starships-secrets -n $NAMESPACE \
  --type='json' \
  -p="[{\"op\": \"replace\", \"path\": \"/data/NEO4J_PASSWORD\", \"value\": \"$(echo -n $NEW_NEO4J_PASSWORD | base64)\"}]"

echo "Secrets rotated. Update GitHub secrets accordingly."
```

## ⚠️ Critical Pre-Deployment Checklist

### Must Complete Before Starting:
1. ✅ **GitHub Secrets**: All secrets added to `prod` environment
2. ⚠️ **Neo4j Auth Testing**: Test your app with Neo4j authentication enabled
3. ✅ **Kinde Callbacks**: Configured for [PROD-DOMAIN-URL]
4. ✅ **DNS Access**: Ready to update Namecheap records
5. ⚠️ **Downtime Notice**: Inform users if needed (2-4 hours DNS propagation)

## Pre-Deployment GitHub Secrets Setup

### Required GitHub Secrets for Production Environment

**Go to: GitHub Repository → Settings → Environments → Production → Secrets**

Add these secrets (DO NOT commit these anywhere):

| Secret Name | Value | Source |
|------------|-------|--------|
| **DIGITALOCEAN_ACCESS_TOKEN** | (Use same as dev) | Your DO API token |
| **KINDE_CLIENT_ID** | `[KINDE-PROD-CLIENT-ID]` | From Kinde dashboard |
| **KINDE_CLIENT_SECRET** | `[API-KEY]` | From Kinde dashboard |
| **KINDE_ISSUER_URL** | `[KINDE-ISSUER-URL]` | Your Kinde domain |
| **NEO4J_PASSWORD** | `[NEO4J-PASSWORD]` | Generated [DEFAULT-PASSWORD] |
| **OPENAI_API_KEY** | (Use same as dev) | OpenAI dashboard |
| **ANTHROPIC_API_KEY** | (Use same as dev) | Anthropic console |
| **STRIPE_SECRET_KEY** | (Use same as dev) | Stripe dashboard |
| **STRIPE_PUBLISHABLE_KEY** | (Use same as dev) | Stripe dashboard |
| **STRIPE_WEBHOOK_SECRET** | (Use same as dev) | Stripe webhooks |
| **GITHUB_USERNAME** | Your GitHub username | For GHCR pull |
| **GITHUB_PAT** | Your PAT with packages:read | GitHub settings |

## Deployment Execution Guide

### Initial Production Deployment Checklist

```bash
# Step-by-step deployment commands

# 1. Create cluster
doctl kubernetes cluster create starships-prod \
  --region nyc1 \
  --size s-2vcpu-4gb \
  --count 1 \
  --auto-upgrade

# 2. Save and switch context
doctl kubernetes cluster kubeconfig save starships-prod
kubectl config use-context do-nyc3-starships-prod

# 3. Install NGINX Ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/do/deploy.yaml

# 4. Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml

# 5. Wait for controllers
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s
kubectl wait --namespace cert-manager --for=condition=ready pod --selector=app.kubernetes.io/instance=cert-manager --timeout=120s

# 6. Get Load Balancer IP
LB_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Load Balancer IP: $LB_IP"
echo "Update DNS records with this IP"

# 7. Create namespace
kubectl create namespace starships-prod

# 8. Create secrets (replace with actual values)
kubectl create secret generic starships-secrets \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --from-literal=STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  --from-literal=STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  --from-literal=STRIPE_PUBLISHABLE_KEY="$STRIPE_PUBLISHABLE_KEY" \
  --from-literal=NEO4J_PASSWORD="$NEO4J_PASSWORD" \
  -n starships-prod

kubectl create secret generic kinde-auth-secret \
  --from-literal=KINDE_CLIENT_ID="$KINDE_CLIENT_ID" \
  --from-literal=KINDE_CLIENT_SECRET="$KINDE_CLIENT_SECRET" \
  --from-literal=KINDE_ISSUER_URL="$KINDE_ISSUER_URL" \
  -n starships-prod

# 9. Create GHCR pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USERNAME \
  --docker-[DEFAULT-PASSWORD]=$GITHUB_PAT \
  -n starships-prod

# 10. Apply manifests
kubectl apply -f k8s/prod/

# 11. Verify deployment
kubectl get all -n starships-prod
kubectl get ingress -n starships-prod
kubectl get certificates -n starships-prod

# 12. Check pod logs
kubectl logs -n starships-prod -l app=starships-ai --tail=50

# 13. Test endpoints (after DNS propagation)
curl -I [PROD-DOMAIN-URL]
curl [PROD-DOMAIN-URL]/api/health
```

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Pods Not Starting

```bash
# Check pod status
kubectl get pods -n starships-prod

# Describe pod for events
kubectl describe pod <pod-name> -n starships-prod

# Check logs
kubectl logs <pod-name> -n starships-prod --previous

# Common causes:
# - Image pull errors: Check GHCR credentials
# - Resource limits: Increase memory/CPU
# - Neo4j startup: Check NEO4J_PASSWORD is set
```

#### 2. SSL Certificate Issues

```bash
# Check certificate status
kubectl get certificates -n starships-prod
kubectl describe certificate starships-tls-cert -n starships-prod

# Check cert-manager logs
kubectl logs -n cert-manager deploy/cert-manager

# Force certificate renewal
kubectl delete certificate starships-tls-cert -n starships-prod
kubectl apply -f k8s/prod/05-ingress.yaml
```

#### 3. Database Connection Issues

```bash
# Test Neo4j connection
kubectl exec -it <pod-name> -n starships-prod -- cypher-shell -u neo4j -p $NEO4J_PASSWORD

# Check Neo4j logs
kubectl exec -it <pod-name> -n starships-prod -- tail -f /var/lib/neo4j/logs/neo4j.log

# Reset Neo4j [DEFAULT-PASSWORD] if needed
kubectl exec -it <pod-name> -n starships-prod -- neo4j-admin dbms set-initial-[DEFAULT-PASSWORD] new[DEFAULT-PASSWORD]
```

#### 4. Performance Issues

```bash
# Check resource usage
kubectl top nodes
kubectl top pods -n starships-prod

# Check HPA status
kubectl get hpa -n starships-prod

# Scale manually if needed
kubectl scale deployment starships-app --replicas=3 -n starships-prod
```

#### 5. DNS/Ingress Issues

```bash
# Check ingress status
kubectl get ingress -n starships-prod
kubectl describe ingress starships-ingress -n starships-prod

# Test with curl using IP
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -k -H "Host: starships.ai" https://$INGRESS_IP

# Check nginx logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

## Performance Optimization

### Resource Tuning Guidelines

```yaml
# Based on load testing results, adjust:

# Light Load (<100 concurrent users)
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "500m"

# Medium Load (100-500 concurrent users)
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"

# Heavy Load (500+ concurrent users)
resources:
  requests:
    memory: "2Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

### Neo4j Performance Tuning

```bash
# Add to deployment environment variables
- name: NEO4J_server_memory_heap_initial__size
  value: "1G"
- name: NEO4J_server_memory_heap_max__size
  value: "2G"
- name: NEO4J_server_memory_pagecache__size
  value: "512M"
```

## Cost Optimization Strategies

### Monthly Cost Breakdown

| Component | Specification | Cost/Month |
|-----------|--------------|------------|
| Kubernetes Nodes | 2x s-2vcpu-4gb | $96 |
| Load Balancer | Small | $12 |
| Block Storage | 45GB total | $4.50 |
| **Total Base** | | **$112.50** |

### Cost Saving Tips

1. **Use Autoscaling**
   - Scale down during off-hours
   - Configure HPA aggressively

2. **Reserved Instances**
   - 1-year commitment: 10% discount
   - 3-year commitment: 20% discount

3. **Resource Optimization**
   ```bash
   # Monitor actual usage
   kubectl top pods -n starships-prod --containers
   
   # Adjust requests/limits based on p95 usage
   ```

4. **Storage Optimization**
   - Use object storage for backups (Spaces: $5/month for 250GB)
   - Implement log rotation
   - Clean old Neo4j transaction logs

## Implementation Timeline

### Week 1: Infrastructure & Security

| Day | Phase | Tasks | Owner |
|-----|-------|-------|-------|
| Day 1 | Security Hardening | • Remove hardcoded secrets<br>• Generate secure [DEFAULT-PASSWORD]s<br>• Create production Kinde app | DevOps |
| Day 2 | Infrastructure Setup | • Create K8s cluster<br>• Install controllers<br>• Configure DNS | DevOps |
| Day 3 | Manifests & Secrets | • Create K8s manifests<br>• Setup GitHub secrets<br>• Configure GHCR access | DevOps |
| Day 4 | CI/CD Configuration | • Update workflows<br>• Test deployment pipeline<br>• Setup monitoring | DevOps |
| Day 5 | Testing & Validation | • Deploy to production<br>• Run smoke tests<br>• Performance testing | QA Team |

### Week 2: Optimization & Go-Live

| Day | Phase | Tasks | Owner |
|-----|-------|-------|-------|
| Day 6 | Load Testing | • Run load tests<br>• Tune resources<br>• Optimize performance | QA Team |
| Day 7 | Security Audit | • Security scan<br>• Penetration testing<br>• Fix vulnerabilities | Security |
| Day 8 | Documentation | • Update runbooks<br>• Create incident response<br>• Train team | DevOps |
| Day 9 | Final Validation | • End-to-end testing<br>• Backup verification<br>• Rollback testing | All Teams |
| Day 10 | Go-Live | • Production deployment<br>• Monitor metrics<br>• Announce launch | All Teams |

**Total Duration: 2 weeks for complete production deployment**

## Production Readiness Checklist

### 🔐 Security
- [ ] Remove all hardcoded secrets from repository
- [ ] Generate secure Neo4j [DEFAULT-PASSWORD] (32+ characters)
- [ ] Create production Kinde OAuth application
- [ ] Configure GitHub environment protection rules
- [ ] Set up GHCR pull secret with read-only PAT
- [ ] Enable Neo4j authentication
- [ ] Disable all debug modes and backdoors
- [ ] Implement network policies
- [ ] Run security vulnerability scan
- [ ] Configure secret rotation schedule

### 🌐 Infrastructure
- [ ] Create DigitalOcean Kubernetes cluster (2+ nodes)
- [ ] Install NGINX Ingress Controller
- [ ] Install cert-manager for SSL
- [ ] Configure cluster autoscaling
- [ ] Set up persistent volumes (40GB+ for Neo4j)
- [ ] Configure backup storage (Spaces/S3)
- [ ] Verify cluster high availability
- [ ] Test disaster recovery procedures

### 🎐 DNS & SSL
- [ ] Get production Load Balancer IP
- [ ] Configure A records in Namecheap
- [ ] Set up www subdomain
- [ ] Create Let's Encrypt production issuer
- [ ] Verify SSL certificate generation
- [ ] Test HTTPS redirect
- [ ] Configure HSTS headers
- [ ] Verify DNS propagation globally

### 📦 Kubernetes Configuration
- [ ] Create production namespace
- [ ] Apply all secrets
- [ ] Deploy PVCs
- [ ] Apply deployment manifest
- [ ] Configure service
- [ ] Set up ingress rules
- [ ] Configure HPA
- [ ] Apply network policies
- [ ] Set pod disruption budget
- [ ] Verify all pods running

### 🚀 CI/CD
- [ ] Create production GitHub environment
- [ ] Add all production secrets to GitHub
- [ ] Update release workflow
- [ ] Create manual deployment workflow
- [ ] Test automated deployment
- [ ] Verify rollback procedures
- [ ] Configure deployment notifications
- [ ] Document deployment process

### 📊 Monitoring & Observability
- [ ] Install metrics server
- [ ] Configure uptime monitoring
- [ ] Set up alerting (email/Slack)
- [ ] Configure log aggregation
- [ ] Create custom dashboards
- [ ] Set up error tracking
- [ ] Configure performance monitoring
- [ ] Test alert notifications

### 🧪 Testing
- [ ] Run integration tests
- [ ] Perform load testing (100+ concurrent users)
- [ ] Test authentication flow
- [ ] Verify Stripe integration
- [ ] Test API endpoints
- [ ] Validate Neo4j queries
- [ ] Check mobile responsiveness
- [ ] Test rollback procedures
- [ ] Verify backup restoration

### 📖 Documentation
- [ ] Update production runbooks
- [ ] Document incident response
- [ ] Create troubleshooting guide
- [ ] Update API documentation
- [ ] Document secret rotation
- [ ] Create disaster recovery plan
- [ ] Train operations team
- [ ] Update user documentation

### 🎆 Go-Live
- [ ] Final security scan
- [ ] Performance baseline
- [ ] Announce maintenance window
- [ ] Execute deployment
- [ ] Verify all services
- [ ] Monitor for 24 hours
- [ ] Announce successful launch
- [ ] Celebrate! 🎉

## Emergency Contacts & Escalation

### Primary Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| DevOps Lead | @your-github | Infrastructure, Deployments |
| Security Lead | @security-github | Security incidents |
| Product Owner | @product-github | Business decisions |
| On-Call Engineer | Rotation | 24/7 incident response |

### Vendor Support

| Service | Support Level | Contact | Response Time |
|---------|--------------|---------|---------------|
| DigitalOcean | Premium | support@digitalocean.com | 1 hour |
| Namecheap | Standard | Live Chat | 24/7 |
| GitHub | Enterprise | github.com/support | 4 hours |
| Kinde | Business | support@kinde.com | 24 hours |
| Stripe | Standard | dashboard.stripe.com | 24 hours |

### Incident Severity Levels

| Level | Description | Response Time | Escalation |
|-------|------------|---------------|------------|
| P1 | Production down | 15 minutes | All teams |
| P2 | Degraded performance | 1 hour | DevOps + Product |
| P3 | Minor issues | 4 hours | DevOps |
| P4 | Non-critical | Next business day | Assigned team |

## References & Resources

### Official Documentation
- [DigitalOcean Kubernetes Guide](https://docs.digitalocean.com/products/kubernetes/)
- [Kubernetes Production Best Practices](https://kubernetes.io/docs/setup/production-environment/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [GitHub Actions Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/)
- [Neo4j Operations Manual](https://neo4j.com/docs/operations-manual/current/)

### Monitoring & Observability
- [Prometheus on K8s](https://prometheus.io/docs/prometheus/latest/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/)
- [DigitalOcean Monitoring](https://docs.digitalocean.com/products/monitoring/)

### Security Resources
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [OWASP Kubernetes Security](https://owasp.org/www-project-kubernetes-top-ten/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)

### Troubleshooting Guides
- [Kubernetes Troubleshooting](https://kubernetes.io/docs/tasks/debug/)
- [Common Ingress Issues](https://kubernetes.github.io/ingress-nginx/troubleshooting/)
- [Neo4j Troubleshooting](https://neo4j.com/docs/operations-manual/current/troubleshooting/)

### Community & Support
- [DigitalOcean Community](https://www.digitalocean.com/community)
- [Kubernetes Slack](https://kubernetes.slack.com)
- [Stack Overflow - Kubernetes](https://stackoverflow.com/questions/tagged/kubernetes)

## Final Notes

### Success Metrics

**Week 1 Post-Launch:**
- Uptime: >99.5%
- Response time: <500ms p95
- Error rate: <1%
- SSL score: A+ (SSL Labs)

**Month 1 Goals:**
- Uptime: >99.9%
- Zero security incidents
- Successful disaster recovery test
- Cost optimization achieved

### Continuous Improvement

1. **Weekly Reviews:**
   - Monitor performance metrics
   - Review error logs
   - Update documentation

2. **Monthly Tasks:**
   - Security updates
   - Cost optimization review
   - Backup verification
   - Load testing

3. **Quarterly Goals:**
   - Architecture review
   - Disaster recovery drill
   - Security audit
   - Technology updates

---

**Document Version:** 2.0
**Last Updated:** $(date)
**Author:** DevOps Team
**Status:** Ready for Implementation

🚀 **Ready to deploy Starships.ai to production!**