# Starships.ai Production Architecture on DigitalOcean

## Services to Deploy

### 1. Neo4j Database (Separate Pod)
- Dedicated Neo4j container
- Persistent volume for data
- Internal service for backend access
- Resource limits: 1GB RAM, 500m CPU

### 2. Backend API (Separate Pod)
- Node.js server container
- Connects to Neo4j via internal service
- Exposed on port 4000
- Resource limits: 1GB RAM, 500m CPU
- Environment variables for configuration

### 3. Frontend (Separate Pod)
- Next.js application
- Connects to backend API
- Exposed on port 3000 via LoadBalancer
- Resource limits: 512MB RAM, 250m CPU

### 4. Optional: Redis (for sessions/caching)
- If needed for session management
- Internal service only

## Deployment Strategy

1. **Separate Deployments**: Each service gets its own deployment
2. **Internal Services**: Neo4j and Backend use ClusterIP services
3. **External Access**: Only Frontend exposed via LoadBalancer
4. **Service Discovery**: Use Kubernetes DNS for inter-service communication
5. **ConfigMaps/Secrets**: Proper configuration management

## Issues to Fix

1. **Import Paths**: Build process needs to compile TypeScript correctly
2. **Authentication**: Either set up Kinde properly or implement alternative
3. **Environment Variables**: Proper configuration for production
4. **Health Checks**: Proper readiness and liveness probes
5. **Logging**: Centralized logging strategy