# Production Scaling Strategy

## Current Configuration
- **Replicas:** 1 (single instance)
- **Resources:** 
  - CPU: 100m request, 500m limit
  - Memory: 128Mi request, 512Mi limit

## Scaling Recommendations

### Horizontal Pod Autoscaler (HPA)
For automatic scaling based on load, add to your deployment:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: starships-app-hpa
  namespace: starships-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: starships-app
  minReplicas: 2
  maxReplicas: 10
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
```

### Manual Scaling
To manually scale the deployment:

```bash
# Scale to 3 replicas
kubectl scale deployment/starships-app --replicas=3 -n starships-prod

# Check scaling status
kubectl get deployment/starships-app -n starships-prod
```

### Production Best Practices

1. **Minimum Replicas:** Always run at least 2 replicas in production for high availability
2. **Pod Disruption Budget:** Ensure at least 1 replica remains during updates
3. **Resource Limits:** Set appropriate CPU/memory limits based on load testing
4. **Node Anti-affinity:** Spread pods across different nodes

### Implementing High Availability

Add to your deployment spec:

```yaml
spec:
  replicas: 2  # Minimum for HA
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Zero-downtime deployments
  template:
    spec:
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
                  - starships-app
              topologyKey: kubernetes.io/hostname
```

### Monitoring Scaling
- Monitor pod CPU/memory usage: `kubectl top pods -n starships-prod`
- Check HPA status: `kubectl get hpa -n starships-prod`
- View scaling events: `kubectl get events -n starships-prod --sort-by='.lastTimestamp'`

### Load Testing
Before scaling, perform load testing to determine optimal resource allocation:

```bash
# Example using Apache Bench
ab -n 10000 -c 100 https://starships.ai/api/health
```

## Next Steps
1. Implement HPA for automatic scaling
2. Increase minimum replicas to 2 for HA
3. Add Pod Disruption Budget
4. Configure monitoring alerts for scaling events