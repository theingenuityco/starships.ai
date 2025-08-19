# Hybrid Kubernetes Deployment Strategy for Starships.ai

## Overview

This document outlines the production deployment strategy for Starships.ai using a hybrid "Semi-Fat Container" approach on Azure Kubernetes Service (AKS). This architecture balances simplicity, performance, and maintainability by bundling the application components while keeping data stores separate.

## Architecture Decision: Semi-Fat Container Approach

### Why Hybrid?

The semi-fat container approach provides the optimal balance:
- **Single domain/ingress** - Everything accessible through port 80
- **Simplified networking** - Frontend and API in same pod
- **Better performance** - No network hop between frontend/API  
- **Easier debugging** - Consolidated logs from single pod
- **Cost efficient** - Fewer load balancers needed
- **Simple scaling** - Just scale the app deployment

## Container Architecture

### Container 1: Application Bundle (Semi-Fat)

**Contents:**
```
/app
├── /server         # API server (dist from packages/server)
├── /client         # Next.js static build (from packages/client)
├── /agent-engine   # Agent services (dist from packages/agent-engine)
├── /shared         # Protocol & models packages
├── /nginx
│   └── nginx.conf  # Routing configuration
└── /scripts
    └── start.sh    # Startup orchestration
```

### Container 2: Neo4j Database (Separate)

**Rationale for separation:**
- Persistent data survives container restarts
- Different resource tuning requirements (CPU/memory)
- Independent backup strategy and snapshots
- Version upgrades without touching application

### Container 3: Redis Cache (Managed Service)

Using Azure Redis Cache instead of self-hosted for production reliability.

## Implementation Details

### 1. Nginx Configuration

```nginx
server {
    listen 80;

    # API calls go to Node.js backend
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # Socket.IO support
    location /socket.io {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }

    # Next.js app
    location / {
        root /app/client;
        try_files $uri $uri.html $uri/ /index.html;
    }
}
```

### 2. Dockerfile for Semi-Fat Container

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /build

# Copy entire monorepo
COPY . .

# Install and build everything
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build

# Runtime stage
FROM node:20-alpine
RUN apk add --no-cache nginx supervisor

WORKDIR /app

# Copy built artifacts
COPY --from=builder /build/packages/server/dist ./server/dist
COPY --from=builder /build/packages/server/node_modules ./server/node_modules
COPY --from=builder /build/packages/client/.next ./client/.next
COPY --from=builder /build/packages/client/public ./client/public
COPY --from=builder /build/packages/agent-engine/dist ./agent-engine/dist
COPY --from=builder /build/packages/agent-engine/node_modules ./agent-engine/node_modules

# Copy shared packages
COPY --from=builder /build/packages/protocol/dist ./shared/protocol
COPY --from=builder /build/packages/models/dist ./shared/models

# Setup nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Supervisor config to manage multiple processes
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 80
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
```

### 3. Process Management with Supervisord

```ini
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0

[program:api]
command=node /app/server/dist/index.js
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="4000"

[program:nginx]
command=nginx -g 'daemon off;'
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
```

## Azure AKS Production Configuration

### Storage Architecture

#### Data Persistence Strategy

**Where Does Data Live?**
- **Physical Location**: Azure Premium SSDs in Microsoft data centers
- **Access Method**: Azure Disk CSI driver
- **Mounting**: Persistent Volumes attached to pods at `/data`

**Visual Architecture:**
```
┌─────────────────────────────────────────┐
│         Azure Data Center                │
│                                          │
│  ┌────────────────┐                     │
│  │  Premium SSD   │                     │
│  │  (256 GB)      │ ← Neo4j data        │
│  └────────┬───────┘                     │
│           │ Network attached             │
│           ↓                              │
│  ┌────────────────┐                     │
│  │  AKS Node      │                     │
│  │  ┌──────────┐  │                     │
│  │  │ Neo4j    │  │                     │
│  │  │ Pod      │  │                     │
│  │  │ /data ←──┼──┼─── Mounted here    │
│  │  └──────────┘  │                     │
│  └────────────────┘                     │
└─────────────────────────────────────────┘
```

### Azure Storage Classes

| Storage Class        | Type           | IOPS          | Best For             | Cost/GB/month |
|----------------------|----------------|---------------|----------------------|---------------|
| managed-csi          | Premium SSD v2 | Up to 80,000  | Production databases | ~$0.08        |
| managed-csi-premium  | Premium SSD    | Up to 20,000  | High-performance     | ~$0.12        |
| managed-csi-standard | Standard SSD   | Up to 6,000   | Dev/staging          | ~$0.05        |
| azurefile-csi        | Azure Files    | Shared access | Shared files         | ~$0.06        |

### Neo4j StatefulSet Configuration

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: neo4j-premium-ssd
provisioner: disk.csi.azure.com
parameters:
  skuName: PremiumV2_LRS  # Premium SSD v2, Locally Redundant
  cachingmode: ReadOnly   # Optimize for database reads
  diskIOPSReadWrite: "5000"  # Guaranteed IOPS
  diskMBpsReadWrite: "150"   # Guaranteed throughput
  logicalSectorSize: "512"   # Optimal for databases
reclaimPolicy: Retain  # CRITICAL: Don't delete disk if PVC deleted
allowVolumeExpansion: true  # Can expand without downtime
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: neo4j
  namespace: starships-production
spec:
  serviceName: neo4j
  replicas: 1
  template:
    spec:
      containers:
      - name: neo4j
        image: neo4j:5-enterprise
        resources:
          requests:
            memory: "8Gi"
            cpu: "2"
          limits:
            memory: "16Gi"
            cpu: "4"
        volumeMounts:
        - name: data
          mountPath: /data
        - name: logs
          mountPath: /logs
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: neo4j-premium-ssd
      resources:
        requests:
          storage: 256Gi  # Start with 256GB for production
  - metadata:
      name: logs
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: managed-csi-standard  # Logs can use standard SSD
      resources:
        requests:
          storage: 32Gi
```

### Main Application Deployment

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: starships-production
  labels:
    cost-center: engineering
    environment: production
    azure.workload.identity/use: "true"  # For managed identity
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: starships-app
  namespace: starships-production
  annotations:
    azure.workload.identity/client-id: "YOUR-MANAGED-IDENTITY-CLIENT-ID"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: starships-app
  namespace: starships-production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: starships
  template:
    metadata:
      labels:
        app: starships
    spec:
      serviceAccountName: starships-app  # Uses managed identity
      nodeSelector:
        agentpool: apppool  # Use specific node pool
      containers:
      - name: app
        image: starshipsacr.azurecr.io/starships-app:latest
        ports:
        - containerPort: 80
        env:
        - name: AZURE_STORAGE_ACCOUNT
          value: "starshipsstorage"
        - name: NEO4J_URI
          value: "bolt://neo4j:7687"
        - name: NEO4J_PASSWORD
          valueFrom:
            secretKeyRef:
              name: neo4j-secrets
              key: password
        - name: REDIS_URL
          value: "redis://starships-redis.redis.cache.windows.net:6379"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: azure-redis
              key: password
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 80
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
```

### Azure Application Gateway Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-production
  annotations:
    kubernetes.io/ingress.class: azure/application-gateway
    appgw.ingress.kubernetes.io/ssl-redirect: "true"
    appgw.ingress.kubernetes.io/backend-protocol: "http"
    appgw.ingress.kubernetes.io/cookie-based-affinity: "true"  # For Socket.IO
spec:
  tls:
  - hosts:
    - starships.ai
    secretName: starships-tls
  rules:
  - host: starships.ai
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-app
            port:
              number: 80
```

## Backup and Disaster Recovery

### 1. Azure Disk Snapshots (Automated Daily)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: neo4j-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: backup-agent
          containers:
          - name: backup
            image: mcr.microsoft.com/azure-cli
            command:
            - /bin/bash
            - -c
            - |
              # Create snapshot
              az snapshot create \
                --resource-group starships-prod-rg \
                --source /subscriptions/xxx/resourceGroups/MC_starships/providers/Microsoft.Compute/disks/neo4j-disk \
                --name neo4j-backup-$(date +%Y%m%d) \
                --incremental true  # Only changed blocks, saves money

              # Delete snapshots older than 7 days
              az snapshot list --resource-group starships-prod-rg \
                --query "[?creationData.createOption=='Copy' && timestamp < '$(date -d '7 days ago' --iso)'].name" \
                -o tsv | xargs -I {} az snapshot delete --name {} --resource-group starships-prod-rg
```

### 2. Neo4j Backup to Azure Blob Storage

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: neo4j-blob-backup
spec:
  schedule: "0 3 * * *"  # Daily at 3 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: neo4j-backup
            image: neo4j:5-enterprise
            env:
            - name: AZURE_STORAGE_ACCOUNT
              valueFrom:
                secretKeyRef:
                  name: azure-storage
                  key: account
            - name: AZURE_STORAGE_KEY
              valueFrom:
                secretKeyRef:
                  name: azure-storage
                  key: key
            command:
            - /bin/bash
            - -c
            - |
              neo4j-admin database backup \
                --from=neo4j://neo4j:7687 \
                --to-path=/tmp/backup \
                neo4j

              # Upload to Azure Blob
              az storage blob upload-batch \
                --destination backups \
                --source /tmp/backup \
                --pattern "*.backup" \
                --destination-path "neo4j/$(date +%Y%m%d)/"
```

### Data Recovery Scenarios

**Pod Restart:**
1. Pod dies
2. New pod starts
3. Same SSD re-attaches
4. Data intact ✅

**Node Failure:**
1. AKS node dies
2. Pod moves to different node
3. SSD detaches from dead node
4. SSD attaches to new node
5. Data intact ✅

**Cluster Deletion:**
1. Delete the cluster
2. PersistentVolume still exists (Retain policy)
3. Can reattach to new cluster ✅

## Infrastructure as Code (Terraform)

```hcl
resource "azurerm_kubernetes_cluster" "starships" {
  name                = "starships-aks"
  location            = "East US 2"
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "starships"

  default_node_pool {
    name                = "system"
    node_count          = 2
    vm_size            = "Standard_D2s_v5"
    enable_auto_scaling = true
    min_count          = 2
    max_count          = 5
    zones              = ["1", "2", "3"]  # Spread across availability zones
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    load_balancer_sku = "standard"
  }

  addon_profile {
    azure_policy {
      enabled = true
    }
    oms_agent {
      enabled = true
      log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
    }
  }

  identity {
    type = "SystemAssigned"
  }
}

# Node pool for Neo4j (needs more memory)
resource "azurerm_kubernetes_cluster_node_pool" "database" {
  name                  = "database"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.starships.id
  vm_size              = "Standard_E4s_v5"  # Memory optimized
  node_count           = 1
  zones                = ["1"]

  node_taints = [
    "dedicated=database:NoSchedule"
  ]
  
  node_labels = {
    workload = "database"
  }
}

# Node pool for spot instances (cost optimization)
resource "azurerm_kubernetes_cluster_node_pool" "spot" {
  name                  = "spot"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.starships.id
  vm_size              = "Standard_D4s_v5"
  node_count           = 1
  enable_auto_scaling  = true
  min_count           = 0
  max_count           = 3
  
  priority        = "Spot"
  eviction_policy = "Delete"
  spot_max_price  = 0.05  # Max price per hour
  
  node_labels = {
    workload = "non-critical"
    "kubernetes.azure.com/scalesetpriority" = "spot"
  }
}
```

## Monitoring and Observability

### Azure Monitor Integration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: container-azm-ms-agentconfig
  namespace: kube-system
data:
  schema-version: v1
  config-version: ver1
  log-data-collection-settings: |
    [log_collection_settings]
       [log_collection_settings.stdout]
          enabled = true
       [log_collection_settings.stderr]
          enabled = true
  prometheus-data-collection-settings: |
    [prometheus_data_collection_settings]
       [prometheus_data_collection_settings.cluster]
          interval = "1m"
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
name: Deploy to AKS
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Login to Azure Container Registry
        uses: azure/docker-login@v1
        with:
          login-server: starshipsacr.azurecr.io
          username: ${{ secrets.AZURE_CLIENT_ID }}
          password: ${{ secrets.AZURE_CLIENT_SECRET }}
      
      - name: Build and Push Docker Image
        run: |
          docker build -t starshipsacr.azurecr.io/starships-app:${{ github.sha }} .
          docker tag starshipsacr.azurecr.io/starships-app:${{ github.sha }} starshipsacr.azurecr.io/starships-app:latest
          docker push starshipsacr.azurecr.io/starships-app:${{ github.sha }}
          docker push starshipsacr.azurecr.io/starships-app:latest
      
      - name: Set AKS Context
        uses: azure/aks-set-context@v3
        with:
          resource-group: starships-prod-rg
          cluster-name: starships-aks
      
      - name: Deploy to AKS
        run: |
          kubectl set image deployment/starships-app app=starshipsacr.azurecr.io/starships-app:${{ github.sha }} -n starships-production
          kubectl rollout status deployment/starships-app -n starships-production
```

## Migration Path

### Phase 1: Initial Deployment (Week 1)
- Build semi-fat container
- Deploy with 1 replica
- Test all functionality
- Verify data persistence

### Phase 2: Add Persistence (Week 2)
- Deploy Neo4j StatefulSet
- Configure Azure Redis Cache
- Test data persistence across restarts
- Implement backup strategy

### Phase 3: Scale Up (Week 3)
- Increase replicas to 3
- Configure HPA (Horizontal Pod Autoscaler)
- Setup monitoring with Azure Monitor
- Load testing

### Phase 4: Production Hardening (Week 4)
- Implement automated backups
- Configure SSL/TLS certificates
- Setup rate limiting
- Add comprehensive observability
- Security scanning

## Cost Optimization

### Estimated Monthly Costs (Production)

| Component                   | Specification           | Cost/Month  |
|-----------------------------|-------------------------|-------------|
| AKS Cluster (Control Plane) | Free                    | $0          |
| App Node Pool               | 3 × D4s_v5 (4CPU, 16GB) | ~$300       |
| Database Node               | 1 × E4s_v5 (4CPU, 32GB) | ~$140       |
| Neo4j Disk                  | 256GB Premium SSD v2    | ~$20        |
| Backup Storage              | 1TB Blob Storage        | ~$20        |
| Azure Redis                 | C1 Standard (1GB)       | ~$50        |
| Application Gateway         | Standard_v2             | ~$150       |
| Bandwidth                   | 1TB egress              | ~$90        |
| **Total**                   |                         | **~$770/month** |

### Cost Optimization Strategies

1. **Use Spot Instances** for non-critical workloads
2. **Reserved Instances** for predictable workloads (up to 72% savings)
3. **Auto-scaling** to match demand
4. **Azure Hybrid Benefit** if you have Windows Server licenses
5. **Right-sizing** based on actual usage metrics

## Operations Playbook

### Common Commands

```bash
# Connect to AKS cluster
az aks get-credentials --resource-group starships-rg --name starships-aks

# Check disk usage
kubectl exec neo4j-0 -- df -h /data

# Create manual snapshot
az disk create-snapshot \
  --resource-group MC_starships-rg_starships-aks_eastus2 \
  --name neo4j-manual-backup \
  --source $(kubectl get pvc data-neo4j-0 -o jsonpath='{.spec.volumeName}')

# Scale application
kubectl scale deployment starships-app --replicas=5 -n starships-production

# Check costs
az consumption usage list --start-date 2024-01-01 --end-date 2024-01-31

# View logs
kubectl logs -f deployment/starships-app -n starships-production

# Execute Neo4j queries
kubectl exec -it neo4j-0 -- cypher-shell -u neo4j -p $NEO4J_PASSWORD

# Monitor resource usage
kubectl top nodes
kubectl top pods -n starships-production
```

### Troubleshooting Guide

**Issue: Pods not starting**
```bash
kubectl describe pod <pod-name> -n starships-production
kubectl logs <pod-name> -n starships-production
```

**Issue: Storage not mounting**
```bash
kubectl get pv
kubectl get pvc -n starships-production
kubectl describe pvc <pvc-name> -n starships-production
```

**Issue: Application not accessible**
```bash
kubectl get ingress -n starships-production
kubectl describe ingress starships-ingress -n starships-production
```

## Security Best Practices

1. **Network Policies** - Restrict pod-to-pod communication
2. **RBAC** - Implement role-based access control
3. **Secret Management** - Use Azure Key Vault for sensitive data
4. **Image Scanning** - Scan container images for vulnerabilities
5. **Pod Security Policies** - Enforce security standards
6. **TLS Everywhere** - Encrypt all traffic
7. **Audit Logging** - Enable and monitor audit logs

## Environment-Specific Configurations

### Development
- Replicas: 1
- Resources: 512Mi memory, 250m CPU
- Storage: 10Gi Standard SSD
- Cost: ~$150/month

### Staging
- Replicas: 2
- Resources: 1Gi memory, 500m CPU
- Storage: 50Gi Premium SSD
- Cost: ~$400/month

### Production
- Replicas: 3-5
- Resources: 2Gi memory, 1 CPU
- Storage: 256Gi Premium SSD v2
- Cost: ~$770/month

## Conclusion

This hybrid deployment strategy provides:
- **Simplicity** through the semi-fat container approach
- **Reliability** with Azure managed services
- **Scalability** via Kubernetes orchestration
- **Cost-effectiveness** through optimization strategies
- **Security** with Azure's enterprise features

The architecture is production-ready and can scale from development to enterprise deployments while maintaining operational simplicity.