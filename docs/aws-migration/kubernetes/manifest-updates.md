# Kubernetes Manifest Updates for AWS EKS

## 📋 Overview

This guide covers the necessary changes to your Kubernetes manifests when migrating from DigitalOcean to AWS EKS. The key differences are in Ingress configuration and Load Balancer annotations.

## 🔄 Key Changes Required

### 1. Ingress Controller Migration
**From**: NGINX Ingress Controller (DigitalOcean)
**To**: AWS Load Balancer Controller (AWS ALB)

### 2. Ingress Annotations
**From**: NGINX-specific annotations
**To**: ALB-specific annotations

### 3. Storage Classes
**From**: DigitalOcean Block Storage
**To**: AWS EBS volumes

## 📝 Updated Kubernetes Manifests

### Updated Ingress (k8s/dev/05-ingress.yaml)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-dev
  annotations:
    # AWS Load Balancer Controller annotations
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    
    # SSL Certificate (will be created by ACM)
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:ACCOUNT:certificate/CERT-ID
    
    # Health check configuration
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-port: "4000"
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "10"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"
    
    # Load balancer attributes
    alb.ingress.kubernetes.io/load-balancer-attributes: |
      idle_timeout.timeout_seconds=60,
      deletion_protection.enabled=false,
      routing.http2.enabled=true
      
    # WAF (optional - can be added later)
    # alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:region:account:webacl/name/id
    
  labels:
    app: starships-ai
    environment: dev
spec:
  rules:
    - host: dev.starships.ai  # or your dev domain
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: starships-api-service
                port:
                  number: 4000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: starships-frontend-service
                port:
                  number: 3000
  tls:
    - hosts:
        - dev.starships.ai
      secretName: starships-dev-tls  # Will be managed by ALB
---
# Alternative: Single service approach (if using your current architecture)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress-single
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
    - host: dev.starships.ai
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: starships-service
                port:
                  number: 8080  # Your reverse proxy port
```

### Updated Persistent Volume Claims (k8s/dev/02-pvc.yaml)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: starships-postgres-pvc
  namespace: starships-dev
  labels:
    app: starships-ai
    component: database
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3  # AWS EBS GP3 (cheaper than gp2)
  resources:
    requests:
      storage: 10Gi
---
# Optional: Session storage PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: starships-sessions-pvc
  namespace: starships-dev
  labels:
    app: starships-ai
    component: sessions
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 5Gi
```

### Updated Deployment (k8s/dev/03-deployment.yaml)

```yaml
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
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: starships-ai
      environment: dev
  template:
    metadata:
      labels:
        app: starships-ai
        environment: dev
      annotations:
        prometheus.io/scrape: 'true'
        prometheus.io/port: '3000'
        # Force pod restart on config changes
        kubectl.kubernetes.io/restartedAt: "2024-01-01T00:00:00Z"
    spec:
      # AWS-specific configurations
      serviceAccountName: starships-service-account  # For IRSA if needed
      
      # Security context (can be enabled once Docker image supports it)
      # securityContext:
      #   runAsUser: 1000
      #   runAsGroup: 1000
      #   fsGroup: 1000
      #   runAsNonRoot: true

      imagePullSecrets:
        - name: ghcr-pull-secret

      containers:
        - name: starships
          image: 'ghcr.io/theingenuityco/starships.ai:latest'  # Updated by CI/CD
          imagePullPolicy: Always
          
          ports:
            - containerPort: 3000
              name: frontend
              protocol: TCP
            - containerPort: 4000
              name: backend
              protocol: TCP
            - containerPort: 8080
              name: proxy
              protocol: TCP

          # Environment variables from secrets
          envFrom:
            - secretRef:
                name: starships-secrets

          # Health checks
          livenessProbe:
            httpGet:
              path: /api/health
              port: 4000
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
            successThreshold: 1

          readinessProbe:
            httpGet:
              path: /api/health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
            successThreshold: 1

          # Startup probe for slower container starts
          startupProbe:
            httpGet:
              path: /api/health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 12  # 2 minutes to start

          # Resource limits (important for cost control)
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"

          # Volume mounts for persistent storage
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
            - name: sessions-storage
              mountPath: /app/sessions
            # Optional: mount config files
            - name: app-config
              mountPath: /app/config
              readOnly: true

      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: starships-postgres-pvc
        - name: sessions-storage
          persistentVolumeClaim:
            claimName: starships-sessions-pvc
        - name: app-config
          configMap:
            name: starships-config
            optional: true

      # Restart policy
      restartPolicy: Always
      
      # DNS configuration for faster lookups
      dnsPolicy: ClusterFirst
      dnsConfig:
        options:
          - name: ndots
            value: "2"
          - name: edns0

      # Node selection (optional - for specific instance types)
      # nodeSelector:
      #   node.kubernetes.io/instance-type: t3.medium
      
      # Tolerations for spot instances
      tolerations:
        - key: "node.kubernetes.io/spot"
          operator: "Exists"
          effect: "NoSchedule"

      # Affinity rules (optional - for HA)
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
```

### Updated Service (k8s/dev/04-service.yaml)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: starships-service
  namespace: starships-dev
  labels:
    app: starships-ai
    environment: dev
  annotations:
    # AWS Load Balancer annotations (if using LoadBalancer type)
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
    
    # Health check annotations
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-path: "/api/health"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-port: "4000"
    
    # Prometheus monitoring
    prometheus.io/scrape: "true"
    prometheus.io/port: "4000"
    prometheus.io/path: "/api/metrics"
spec:
  type: ClusterIP  # Use ClusterIP for ALB, LoadBalancer for NLB
  selector:
    app: starships-ai
    environment: dev
  ports:
    - name: frontend
      port: 3000
      targetPort: 3000
      protocol: TCP
    - name: backend
      port: 4000
      targetPort: 4000
      protocol: TCP
    - name: proxy
      port: 8080
      targetPort: 8080
      protocol: TCP
  sessionAffinity: None
---
# Optional: Separate services for ALB target groups
apiVersion: v1
kind: Service
metadata:
  name: starships-frontend-service
  namespace: starships-dev
  labels:
    app: starships-ai
    component: frontend
spec:
  type: ClusterIP
  selector:
    app: starships-ai
    environment: dev
  ports:
    - port: 3000
      targetPort: 3000
      protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: starships-api-service
  namespace: starships-dev
  labels:
    app: starships-ai
    component: api
spec:
  type: ClusterIP
  selector:
    app: starships-ai
    environment: dev
  ports:
    - port: 4000
      targetPort: 4000
      protocol: TCP
```

### Service Account for IRSA (k8s/dev/01-serviceaccount.yaml)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: starships-service-account
  namespace: starships-dev
  labels:
    app: starships-ai
    environment: dev
  annotations:
    # IAM Role for Service Accounts (IRSA) - optional for future AWS service access
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/starships-dev-irsa-role
---
# Role binding for service account (if needed)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: starships-role
  namespace: starships-dev
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: starships-role-binding
  namespace: starships-dev
subjects:
  - kind: ServiceAccount
    name: starships-service-account
    namespace: starships-dev
roleRef:
  kind: Role
  name: starships-role
  apiGroup: rbac.authorization.k8s.io
```

## 🔧 Production Manifest Differences

For production (`k8s/prod/`), make these changes:

### 1. Different Ingress Host
```yaml
# k8s/prod/05-ingress.yaml
spec:
  rules:
    - host: starships.ai  # Production domain
```

### 2. Higher Resource Limits
```yaml
# k8s/prod/03-deployment.yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### 3. More Replicas
```yaml
# k8s/prod/03-deployment.yaml
spec:
  replicas: 3  # Higher availability
```

### 4. RDS Connection
```yaml
# Environment variables will use RDS instead of embedded PostgreSQL
# This is handled in GitHub Actions secrets
```

## 🚀 Deployment Order

Always deploy in this order:
1. **Namespace** (`00-namespace.yaml`)
2. **ServiceAccount** (`01-serviceaccount.yaml`)
3. **PVC** (`02-pvc.yaml`)
4. **Deployment** (`03-deployment.yaml`)
5. **Service** (`04-service.yaml`)
6. **Ingress** (`05-ingress.yaml`)

## 🔍 Validation Commands

After deployment, verify everything works:

```bash
# Check all resources
kubectl get all -n starships-dev

# Check ingress
kubectl describe ingress starships-ingress -n starships-dev

# Check ALB creation
kubectl get ingress starships-ingress -n starships-dev -o yaml

# Check pods
kubectl logs deployment/starships-app -n starships-dev

# Test health endpoint
kubectl port-forward deployment/starships-app 4000:4000 -n starships-dev
curl http://localhost:4000/api/health
```

## 📊 Monitoring Integration

### CloudWatch Container Insights
Automatically enabled with these annotations:
```yaml
annotations:
  prometheus.io/scrape: 'true'
  prometheus.io/port: '4000'
```

### Application Performance Monitoring
Add these environment variables to deployment:
```yaml
env:
  - name: AWS_REGION
    value: "ap-south-1"
  - name: CLUSTER_NAME
    value: "starships-dev"
  - name: NODE_NAME
    valueFrom:
      fieldRef:
        fieldPath: spec.nodeName
  - name: POD_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
```

---

*These manifest updates will ensure your application works seamlessly with AWS EKS and its native services. The next step is setting up Route53 DNS and SSL certificates.*