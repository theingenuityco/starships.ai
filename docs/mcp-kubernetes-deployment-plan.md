# MCP Kubernetes Deployment Implementation Plan

## Overview
This document outlines the implementation plan for MCP connector deployments using Kubernetes. Kubernetes is now the **only** deployment option for MCP containers - Docker Compose is no longer supported.

## Architecture Design

### Core Concepts

1. **Namespace Isolation**
   - Each starship gets its own Kubernetes namespace: `starship-{starshipId}`
   - Provides network isolation between starships
   - ResourceQuota per namespace to prevent exhaustion
   - Simplifies resource management and cleanup

2. **HTTP Bridge Architecture**
   - Continue using HTTP bridge per MCP pod for consistency
   - Each MCP connector runs in its own pod with HTTP bridge
   - Bridge image built and pushed to local registry
   - Maintains isolation and simplifies communication

3. **Storage Strategy**
   - Shared PersistentVolume per starship (not per MCP)
   - Files persist across MCP deployments/removals
   - Mounted at `/data/starship` in each MCP pod
   - Storage size configurable per environment

4. **Service Discovery**
   - ClusterIP services for internal communication
   - DNS naming: `mcp-{slug}.starship-{id}.svc.cluster.local`
   - Service registry updated with endpoints
   - Main app connects via service DNS names

5. **Deployment Strategy**
   - Concurrent deployments managed via p-queue
   - Rollback on failure with cleanup
   - Deployment status tracked in database
   - Event-driven updates via websockets

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │           Namespace: starship-{id}                 │     │
│  │                                                    │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │     PersistentVolumeClaim (Shared)       │     │     │
│  │  │     /data/starship                       │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │                                                    │     │
│  │  ┌─────────────────┐  ┌─────────────────┐        │     │
│  │  │  MCP Pod 1      │  │  MCP Pod 2      │        │     │
│  │  │  ┌────────────┐ │  │  ┌────────────┐ │        │     │
│  │  │  │HTTP Bridge │ │  │  │HTTP Bridge │ │        │     │
│  │  │  │  :8080     │ │  │  │  :8080     │ │        │     │
│  │  │  └────────────┘ │  │  └────────────┘ │        │     │
│  │  │  ┌────────────┐ │  │  ┌────────────┐ │        │     │
│  │  │  │MCP Server  │ │  │  │MCP Server  │ │        │     │
│  │  │  └────────────┘ │  │  └────────────┘ │        │     │
│  │  └─────────────────┘  └─────────────────┘        │     │
│  │         ↓                    ↓                    │     │
│  │  ┌─────────────────┐  ┌─────────────────┐        │     │
│  │  │   Service 1     │  │   Service 2     │        │     │
│  │  │  ClusterIP      │  │  ClusterIP      │        │     │
│  │  └─────────────────┘  └─────────────────┘        │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Ingress Controller (nginx)            │     │
│  └────────────────────────────────────────────────────┘     │
│                           ↓                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   Main Application Gateway
```

## Implementation Components

### 1. KubernetesDeployer Class

**Location:** `/packages/core/src/services/mcp/KubernetesDeployer.ts`

Key responsibilities:
- Implements MCPDeployer interface
- Manages namespace lifecycle with ResourceQuotas
- Creates/updates Kubernetes resources
- Handles deployment rollouts and rollbacks
- Manages persistent storage and cleanup
- Updates database with K8s metadata (pod names, service endpoints)
- Handles concurrent deployments with queue

### 2. Kubernetes Templates

**Location:** `/packages/core/src/services/mcp/k8s/templates/`

Templates needed:
- `deployment.yaml.ts` - Deployment template generator
- `service.yaml.ts` - Service template generator  
- `configmap.yaml.ts` - ConfigMap for environment variables
- `secret.yaml.ts` - Secret for API keys
- `pvc.yaml.ts` - PersistentVolumeClaim for starship storage
- `namespace.yaml.ts` - Namespace creation with ResourceQuota
- `serviceaccount.yaml.ts` - ServiceAccount for pods
- `resourcequota.yaml.ts` - Resource limits per namespace

### 3. Kubernetes Service Templates

**Location:** `/packages/core/src/services/mcp/KubernetesServiceTemplate.ts`

Similar to DockerServiceTemplate but with K8s-specific configurations:
- Resource requests/limits
- Probe configurations
- Volume mount paths
- Service port mappings

## Implementation Steps

### Phase 1: Core Infrastructure

1. **Build and Push HTTP Bridge Image**
   ```bash
   # Build the HTTP bridge image
   docker build -t localhost:5001/starships/mcp-http-bridge:latest ./packages/core/docker/mcp-http-bridge
   docker push localhost:5001/starships/mcp-http-bridge:latest
   ```

2. **Setup Kubernetes Client**
   ```typescript
   // Already installed
   @kubernetes/client-node
   p-queue for concurrent deployments
   ```

3. **Create KubernetesDeployer Class**
   - Implement MCPDeployer interface
   - Add namespace management with quotas
   - Add resource creation methods
   - Implement rollback mechanism

4. **Create Template Generators**
   - Dynamic manifest generation
   - Resource naming conventions
   - Label/selector strategies
   - Consistent annotation scheme

### Phase 2: Deployment Logic

5. **Implement Deployment Methods**
   - `deploy()` - Create new MCP deployment with rollback on failure
   - `remove()` - Remove specific MCP with cleanup
   - `removeAll()` - Cleanup entire starship namespace
   - `updateEnvironment()` - Update ConfigMaps/Secrets with rolling update
   - `getStatus()` - Get deployment status from K8s
   - `getLogs()` - Stream logs from pods

6. **Storage Management**
   - PVC creation per starship (first MCP creates it)
   - Volume mounting in all MCP pods
   - Cleanup only on starship deletion
   - Size monitoring and alerts

7. **Service Discovery & Communication**
   - Internal DNS names for service discovery
   - Service registry updates with endpoints
   - Health endpoint exposure on :8080/health
   - Database updates with K8s metadata

### Phase 3: Development Environment

8. **Kind Cluster Management**
   - Auto-creation script (completed)
   - Cluster configuration with registry
   - HTTP bridge image auto-build

9. **Development Tools**
   - Log streaming endpoint for UI
   - Port-forwarding helper scripts
   - Debug mode with increased logging
   - kubectl aliases for common operations

### Phase 4: Production Readiness

10. **Health & Monitoring**
    - Liveness probes: `/health/live`
    - Readiness probes: `/health/ready`
    - Startup probes: 120s timeout for slow starts
    - Metrics exposure via `/metrics`

11. **Security & Access Control**
    - ServiceAccount per namespace
    - RBAC with minimal permissions
    - Secrets for API keys (no ConfigMaps)
    - Network policies (basic isolation)

12. **Error Handling & Recovery**
    - Deployment rollback on failure
    - Cleanup of partial deployments
    - Event tracking for audit
    - Webhook notifications for failures

## Code Structure

```
packages/core/src/services/
├── mcp/
│   ├── KubernetesDeployer.ts           # Main K8s deployer
│   ├── KubernetesServiceTemplate.ts    # K8s service configs
│   ├── k8s/
│   │   ├── KubernetesClient.ts        # K8s API client wrapper
│   │   ├── NamespaceManager.ts        # Namespace operations
│   │   ├── ResourceManager.ts         # Resource CRUD operations
│   │   ├── DeploymentQueue.ts         # Concurrent deployment queue
│   │   ├── RollbackManager.ts         # Deployment rollback logic
│   │   ├── LogStreamer.ts             # Pod log streaming
│   │   ├── templates/
│   │   │   ├── deployment.ts          # Deployment generator
│   │   │   ├── service.ts             # Service generator
│   │   │   ├── configmap.ts           # ConfigMap generator
│   │   │   ├── secret.ts              # Secret generator
│   │   │   ├── pvc.ts                 # PVC generator
│   │   │   ├── namespace.ts           # Namespace generator
│   │   │   ├── serviceaccount.ts      # ServiceAccount generator
│   │   │   └── resourcequota.ts       # ResourceQuota generator
│   │   └── utils/
│   │       ├── labels.ts              # Label utilities
│   │       ├── naming.ts              # Naming conventions
│   │       ├── resources.ts           # Resource helpers
│   │       └── cluster-setup.ts       # Cluster setup utilities
│   └── __tests__/
│       ├── KubernetesDeployer.test.ts
│       └── k8s/
│           └── templates.test.ts
```

## Configuration

### Environment Variables

```env
# Development
K8S_CONTEXT=kind-starships
K8S_NAMESPACE_PREFIX=starship
K8S_STORAGE_CLASS=standard
K8S_STORAGE_SIZE=1Gi

# Production (Azure)
K8S_CONTEXT=aks-starships-prod
K8S_NAMESPACE_PREFIX=starship
K8S_STORAGE_CLASS=azure-disk
K8S_STORAGE_SIZE=10Gi
K8S_INGRESS_CLASS=nginx
```

### DeploymentConfig Updates

```typescript
interface KubernetesConfig {
  context?: string;              // K8s context to use
  namespacePrefix: string;       // Prefix for namespaces
  storageClass: string;          // Storage class for PVCs
  defaultStorageSize: string;    // Default PVC size
  ingressClass?: string;         // Ingress controller class
  autoCreateCluster: boolean;    // Auto-create kind cluster
  localRegistry: string;         // Local registry for images
  resourceDefaults: {
    cpu: {
      request: string;          // e.g., "100m"
      limit: string;            // e.g., "500m"
    };
    memory: {
      request: string;          // e.g., "128Mi"
      limit: string;            // e.g., "512Mi"
    };
  };
  quotaPerNamespace: {           // Resource quota per starship
    pods: string;               // e.g., "10"
    requests: {
      cpu: string;              // e.g., "4"
      memory: string;           // e.g., "8Gi"
      storage: string;          // e.g., "20Gi"
    };
  };
  deploymentQueue: {
    concurrency: number;        // Max concurrent deployments
    timeout: number;            // Deployment timeout in ms
  };
}
```

## Development Workflow

### Automatic Setup (Required)

The Kubernetes environment is **automatically configured** when you run:

```bash
pnpm install
pnpm run build  # This automatically sets up K8s environment
```

The build process will:
1. Check for required tools (Docker, kind, kubectl) - **exits if not available**
2. Attempt to install missing tools (macOS only via brew)
3. Create a local Kind cluster if not exists - **required for app to start**
4. Install NGINX ingress controller
5. Setup local Docker registry
6. Configure storage classes

**Note:** The application will not start without a working Kubernetes cluster.

### Manual Setup (Optional)

If automatic setup fails or you prefer manual control:

1. **Install Prerequisites**
   ```bash
   # Install kind
   brew install kind
   
   # Install kubectl
   brew install kubectl
   
   # Create cluster manually
   pnpm run k8s:setup
   ```

2. **Start Development**
   ```bash
   # Start the application (K8s is required)
   pnpm run dev
   ```

3. **Environment Variables**
   ```bash
   # Skip automatic K8s setup (for CI/CD environments with existing cluster)
   SKIP_K8S_SETUP=true pnpm run build
   
   # Note: DEPLOYER_TYPE is no longer used - Kubernetes is the only option
   ```

4. **Debugging**
   ```bash
   # View logs
   kubectl logs -n starship-123 -l app=mcp-connector
   
   # Port forward
   kubectl port-forward -n starship-123 svc/mcp-time 8080:8080
   ```

## Key Implementation Details

### Naming Conventions
- Namespace: `starship-{starshipId}`
- Deployment: `mcp-{slug}-deployment`
- Service: `mcp-{slug}-service`
- ConfigMap: `mcp-{slug}-config`
- Secret: `mcp-{slug}-secret`
- PVC: `starship-{starshipId}-storage`

### Labels & Selectors
```yaml
labels:
  app: mcp-connector
  starship: "{starshipId}"
  mcp: "{slug}"
  managed-by: starships
  version: "{version}"
```

### Database Integration
Store in Neo4j:
- `kubernetesNamespace`: namespace name
- `kubernetesPodName`: pod name
- `kubernetesServiceUrl`: internal service URL
- `kubernetesStatus`: deployment status
- `kubernetesResourceVersion`: for updates

### Error Recovery Strategy
1. Pre-deployment validation
2. Create resources in order (namespace → quota → pvc → secret → configmap → deployment → service)
3. On failure, rollback in reverse order
4. Store rollback state in database
5. Retry with exponential backoff

## Testing Strategy

1. **Unit Tests**
   - Template generation with various configs
   - Resource naming consistency
   - Label selection and matching
   - Quota calculations

2. **Integration Tests**
   - Deployment lifecycle with real K8s
   - Resource cleanup verification
   - Update operations with rollback
   - Concurrent deployment handling

3. **E2E Tests**
   - Full deployment flow with UI
   - Multi-MCP scenarios
   - Failure recovery and rollback
   - Database state consistency

## Rollout Plan

1. **Week 1:** Core implementation
2. **Week 2:** Development environment & testing
3. **Week 3:** Production readiness & documentation
4. **Week 4:** Staging deployment & validation

## Success Metrics

- Deployment time < 30 seconds
- Resource usage within limits
- Zero data loss on updates
- 99.9% availability SLA
- Clean namespace cleanup

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Resource exhaustion | Set resource limits & quotas |
| Storage issues | Monitor PVC usage, alerts |
| Network failures | Retry logic, circuit breakers |
| Deployment failures | Rollback strategy, health checks |
| Security concerns | RBAC, NetworkPolicies (future) |

## Future Enhancements

1. **Phase 2 (Later)**
   - Horizontal Pod Autoscaling
   - Network Policies for stricter isolation
   - Secrets encryption at rest
   - External secrets management
   - Prometheus metrics
   - Distributed tracing

2. **Phase 3 (Future)**
   - Multi-region deployment
   - Service mesh integration
   - GitOps with ArgoCD
   - Cost optimization
   - GPU support for ML models

## Dependencies

```json
{
  "@kubernetes/client-node": "^0.20.0",
  "js-yaml": "^4.1.0",
  "p-queue": "^7.4.1"  // For concurrent deployments
}
```

## Scripts

```json
{
  "scripts": {
    "k8s:dev:setup": "scripts/setup-kind-cluster.sh",
    "k8s:dev:cleanup": "kind delete cluster --name starships",
    "k8s:deploy": "ts-node scripts/deploy-to-k8s.ts",
    "k8s:logs": "kubectl logs -f -n $NAMESPACE -l app=mcp-connector"
  }
}
```

## API Endpoints

### Deployment Management
- `POST /api/mcp/deploy` - Deploy new MCP
- `DELETE /api/mcp/{connectorId}` - Remove MCP
- `PUT /api/mcp/{connectorId}/update` - Update MCP config
- `GET /api/mcp/{connectorId}/status` - Get deployment status
- `GET /api/mcp/{connectorId}/logs` - Stream logs

### Debugging
- `GET /api/k8s/namespaces` - List all starship namespaces
- `GET /api/k8s/namespace/{starshipId}/resources` - List namespace resources
- `GET /api/k8s/health` - K8s cluster health check
- `POST /api/k8s/namespace/{starshipId}/debug` - Enable debug mode

## Troubleshooting Guide

### Common Issues

1. **Pod not starting**
   - Check: `kubectl describe pod -n starship-{id} {pod-name}`
   - Likely: Image pull issue or resource limits

2. **Service not accessible**
   - Check: `kubectl get svc -n starship-{id}`
   - Verify: DNS resolution and service selector

3. **Storage issues**
   - Check: `kubectl get pvc -n starship-{id}`
   - Verify: StorageClass exists and PV available

4. **Deployment rollback**
   - Auto-rollback on failure
   - Manual: `kubectl rollout undo deployment -n starship-{id} {deployment}`

5. **Namespace quota exceeded**
   - Check: `kubectl describe resourcequota -n starship-{id}`
   - Action: Increase quota or remove unused MCPs

## Monitoring & Observability

### Metrics to Track
- Deployment success rate
- Average deployment time
- Pod restart count
- Resource utilization per namespace
- PVC usage percentage
- API response times

### Logging Strategy
- Structured JSON logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Correlation IDs for request tracking
- Centralized log aggregation (future)

## Conclusion

This enhanced plan addresses all critical aspects of Kubernetes deployment for MCP connectors:
- ✅ Image management with local registry
- ✅ Service discovery and communication
- ✅ Concurrent deployment handling
- ✅ Error recovery and rollback
- ✅ Database integration
- ✅ Security with RBAC and quotas
- ✅ Developer experience with debugging tools
- ✅ Production readiness with monitoring

Next steps:
1. Build and push HTTP bridge image
2. Implement KubernetesDeployer class
3. Create template generators
4. Test deployment flow
5. Add monitoring and debugging tools