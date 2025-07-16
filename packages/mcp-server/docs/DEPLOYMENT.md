# MCP Server Deployment Guide

## Overview

This guide covers deploying the MCP (Model Context Protocol) Server in production environments with proper security, monitoring, and scalability considerations.

## Prerequisites

### System Requirements
- **Docker**: Version 20.10+ with Docker Compose
- **Node.js**: Version 18+ with pnpm
- **Neo4j**: Version 5.0+ (for metadata storage)
- **Memory**: Minimum 4GB RAM (8GB+ recommended)
- **Storage**: 20GB+ available disk space
- **Network**: Outbound internet access for tool execution

### Security Requirements
- **Docker Socket Access**: Secure access to `/var/run/docker.sock`
- **SSL/TLS**: HTTPS certificates for production
- **Firewall**: Proper network isolation and port management
- **Authentication**: JWT tokens and API keys

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Nginx     │  │   Server    │  │      Neo4j Database     │  │
│  │ Load Balancer│  │ Container   │  │       Container         │  │
│  │   (SSL)     │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                 │                       │             │
│         └─────────────────┼───────────────────────┘             │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │              MCP User Containers Network                    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  │   User A    │  │   User B    │  │   User C    │        │
│  │  │ MCP Tools   │  │ MCP Tools   │  │ MCP Tools   │        │
│  │  │ Container   │  │ Container   │  │ Container   │        │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │
│  └─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

## Environment Configuration

### 1. Environment Variables

Create a production `.env` file:

```bash
# Core Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database Configuration
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_secure_password
NEO4J_DATABASE=starships

# Authentication
JWT_SECRET=your_jwt_secret_key_here
KINDE_DOMAIN=your-kinde-domain.kinde.com
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret

# MCP Configuration
MCP_SERVER_PORT=3002
MCP_DOCKER_SOCKET=/var/run/docker.sock
MCP_CONTAINER_REGISTRY=docker.io
MCP_DEFAULT_MEMORY_LIMIT=512m
MCP_DEFAULT_CPU_LIMIT=0.5
MCP_DEFAULT_TIMEOUT=30000
MCP_NETWORK_MODE=mcp-tools-network

# Security Configuration
MCP_ENABLE_RATE_LIMITING=true
MCP_RATE_LIMIT_WINDOW=60000
MCP_RATE_LIMIT_MAX_REQUESTS=100
MCP_ENABLE_REQUEST_SANITIZATION=true
MCP_ENABLE_AUDIT_LOGGING=true
MCP_ENCRYPTION_KEY=your_32_character_encryption_key

# Container Security
MCP_CONTAINER_MEMORY_LIMIT=512m
MCP_CONTAINER_CPU_LIMIT=0.5
MCP_CONTAINER_PROCESS_LIMIT=100
MCP_CONTAINER_FILE_DESCRIPTOR_LIMIT=1024
MCP_CONTAINER_NETWORK_ISOLATION=true

# Monitoring
MCP_ENABLE_METRICS=true
MCP_METRICS_PORT=9090
MCP_LOG_LEVEL=info
```

### 2. Docker Configuration

#### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

networks:
  starships-network:
    driver: bridge
  mcp-tools-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  neo4j_data:
  neo4j_logs:
  mcp_logs:

services:
  # Neo4j Database
  neo4j:
    image: neo4j:5.15-community
    container_name: starships-neo4j-prod
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_security_procedures_unrestricted: apoc.*
      NEO4J_dbms_memory_heap_initial__size: 512m
      NEO4J_dbms_memory_heap_max__size: 2g
      NEO4J_dbms_memory_pagecache_size: 1g
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    networks:
      - starships-network
    ports:
      - "7474:7474"
      - "7687:7687"
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p ${NEO4J_PASSWORD} 'RETURN 1'"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Main Server
  server:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: starships-server-prod
    restart: unless-stopped
    environment:
      NODE_ENV: production
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USERNAME: neo4j
      NEO4J_PASSWORD: ${NEO4J_PASSWORD}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - mcp_logs:/app/logs
    networks:
      - starships-network
      - mcp-tools-network
    ports:
      - "3001:3001"
      - "3002:3002"
    depends_on:
      neo4j:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    container_name: starships-nginx-prod
    restart: unless-stopped
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    networks:
      - starships-network
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - server

  # MCP Tools Base Image Builder
  mcp-tools-builder:
    build:
      context: ./docker/templates/python-tools
      dockerfile: Dockerfile
    image: starships-mcp-tools:latest
    container_name: mcp-tools-builder
    networks:
      - mcp-tools-network
    command: ["echo", "MCP tools base image built"]
```

#### Production Dockerfile

Create `Dockerfile.prod`:

```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/models/package.json ./packages/models/

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build packages
RUN pnpm -r build

# Production stage
FROM node:18-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S starships -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=starships:nodejs /app/packages/mcp-server/dist ./dist
COPY --from=builder --chown=starships:nodejs /app/packages/mcp-server/package.json ./
COPY --from=builder --chown=starships:nodejs /app/node_modules ./node_modules

# Create logs directory
RUN mkdir -p /app/logs && chown starships:nodejs /app/logs

# Switch to non-root user
USER starships

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
```

### 3. Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream starships_backend {
        server server:3001;
    }

    upstream mcp_backend {
        server server:3002;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=mcp:10m rate=5r/s;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Main API Server
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # API endpoints
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://starships_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Socket.IO
        location /socket.io/ {
            proxy_pass http://starships_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /health {
            proxy_pass http://starships_backend;
            access_log off;
        }
    }

    # MCP Server
    server {
        listen 443 ssl http2;
        server_name mcp.your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        location / {
            limit_req zone=mcp burst=10 nodelay;
            proxy_pass http://mcp_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
    }
}
```

## Security Hardening

### 1. Container Security

#### Docker Daemon Configuration

Create `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  },
  "userland-proxy": false,
  "experimental": false,
  "live-restore": true
}
```

#### User Container Security

The MCP system automatically applies these security measures to user containers:

```typescript
// Security configuration applied to all user containers
const securityConfig = {
  HostConfig: {
    // Resource limits
    Memory: parseMemoryLimit(config.limits.memory),
    CpuShares: parseCpuLimit(config.limits.cpu),
    PidsLimit: 100,
    
    // Network isolation
    NetworkMode: 'none', // No network access by default
    
    // Security options
    SecurityOpt: [
      'no-new-privileges:true',
      'seccomp=unconfined',
      'apparmor=unconfined'
    ],
    
    // Capability management
    CapDrop: ['ALL'], // Drop all capabilities
    CapAdd: [], // Add only necessary capabilities
    
    // File system limits
    Ulimits: [
      { Name: 'nofile', Soft: 1024, Hard: 1024 },
      { Name: 'nproc', Soft: 50, Hard: 50 },
      { Name: 'fsize', Soft: 100 * 1024 * 1024, Hard: 100 * 1024 * 1024 }
    ],
    
    // Temporary storage
    Tmpfs: {
      '/tmp': 'rw,noexec,nosuid,size=100m',
      '/var/tmp': 'rw,noexec,nosuid,size=50m'
    }
  }
};
```

### 2. Network Security

#### Firewall Configuration (UFW)

```bash
# Reset firewall
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH access
sudo ufw allow 22/tcp

# HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Neo4j (restrict to internal network)
sudo ufw allow from 172.18.0.0/16 to any port 7687

# Enable firewall
sudo ufw enable
```

#### Docker Network Isolation

```bash
# Create isolated network for MCP containers
docker network create \
  --driver bridge \
  --subnet=172.20.0.0/16 \
  --opt com.docker.network.bridge.enable_icc=false \
  --opt com.docker.network.bridge.enable_ip_masquerade=false \
  mcp-tools-network
```

### 3. SSL/TLS Configuration

#### Generate SSL Certificates

```bash
# Using Let's Encrypt (recommended)
sudo certbot certonly --standalone -d your-domain.com -d mcp.your-domain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
```

## Monitoring and Logging

### 1. Application Monitoring

#### Health Check Endpoints

```typescript
// Health check implementation
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});

app.get('/health/mcp', async (req, res) => {
  try {
    const containerManager = new UserContainerManager();
    await containerManager.initialize();
    
    res.json({
      status: 'healthy',
      docker: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

#### Prometheus Metrics

Add to `package.json`:

```json
{
  "dependencies": {
    "prom-client": "^14.2.0"
  }
}
```

Implement metrics collection:

```typescript
import client from 'prom-client';

// Create metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const mcpToolExecutions = new client.Counter({
  name: 'mcp_tool_executions_total',
  help: 'Total number of MCP tool executions',
  labelNames: ['tool_name', 'user_id', 'status']
});

const mcpContainerCount = new client.Gauge({
  name: 'mcp_containers_active',
  help: 'Number of active MCP containers'
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(client.register.metrics());
});
```

### 2. Logging Configuration

#### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.MCP_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-server' },
  transports: [
    new winston.transports.File({ 
      filename: '/app/logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: '/app/logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### Log Rotation

Create `logrotate.conf`:

```
/app/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 starships starships
    postrotate
        docker kill -s USR1 starships-server-prod
    endscript
}
```

## Deployment Steps

### 1. Pre-deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Docker and Docker Compose installed
- [ ] Firewall rules configured
- [ ] Database backup strategy in place
- [ ] Monitoring tools configured

### 2. Initial Deployment

```bash
# Clone repository
git clone https://github.com/your-org/starships.ai.git
cd starships.ai

# Set up environment
cp .env.example .env.production
# Edit .env.production with production values

# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
curl -f https://your-domain.com/health
curl -f https://mcp.your-domain.com/health
```

### 3. Database Migration

```bash
# Run database migrations
docker exec starships-server-prod npm run migrate

# Verify database schema
docker exec starships-neo4j-prod cypher-shell -u neo4j -p password "SHOW CONSTRAINTS"
```

### 4. Post-deployment Verification

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f server

# Test MCP functionality
curl -X POST https://mcp.your-domain.com/api/mcp/configure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{"userId": "test-user", "tools": [], "agentPermissions": {}, "agentToolCredentials": {}, "limits": {"memory": "512m", "cpu": "0.5", "timeout": 30000}}'
```

## Scaling and Performance

### 1. Horizontal Scaling

#### Load Balancer Configuration

```nginx
upstream starships_backend {
    least_conn;
    server server1:3001 max_fails=3 fail_timeout=30s;
    server server2:3001 max_fails=3 fail_timeout=30s;
    server server3:3001 max_fails=3 fail_timeout=30s;
}
```

#### Container Orchestration

For larger deployments, consider using Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp-server
        image: starships/mcp-server:latest
        ports:
        - containerPort: 3001
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### 2. Performance Optimization

#### Container Resource Management

```typescript
// Implement container pooling for better resource utilization
class ContainerPool {
  private availableContainers: Map<string, string[]> = new Map();
  private maxPoolSize = 10;
  
  async getContainer(userId: string, toolType: string): Promise<string> {
    const poolKey = `${userId}-${toolType}`;
    const pool = this.availableContainers.get(poolKey) || [];
    
    if (pool.length > 0) {
      return pool.pop()!;
    }
    
    return await this.createNewContainer(userId, toolType);
  }
  
  async returnContainer(containerId: string, userId: string, toolType: string): Promise<void> {
    const poolKey = `${userId}-${toolType}`;
    const pool = this.availableContainers.get(poolKey) || [];
    
    if (pool.length < this.maxPoolSize) {
      pool.push(containerId);
      this.availableContainers.set(poolKey, pool);
    } else {
      await this.destroyContainer(containerId);
    }
  }
}
```

## Backup and Recovery

### 1. Database Backup

```bash
#!/bin/bash
# backup-neo4j.sh

BACKUP_DIR="/backups/neo4j"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="neo4j_backup_${DATE}.dump"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database dump
docker exec starships-neo4j-prod neo4j-admin database dump \
  --to-path=/backups \
  neo4j

# Copy backup from container
docker cp starships-neo4j-prod:/backups/neo4j.dump \
  $BACKUP_DIR/$BACKUP_FILE

# Compress backup
gzip $BACKUP_DIR/$BACKUP_FILE

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/${BACKUP_FILE}.gz"
```

### 2. Container State Backup

```bash
#!/bin/bash
# backup-containers.sh

BACKUP_DIR="/backups/containers"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Export container configurations
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" > \
  $BACKUP_DIR/containers_${DATE}.txt

# Backup container volumes
docker run --rm -v mcp_logs:/data -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/mcp_logs_${DATE}.tar.gz -C /data .

echo "Container backup completed: $BACKUP_DIR"
```

### 3. Recovery Procedures

```bash
#!/bin/bash
# restore-neo4j.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.dump.gz>"
  exit 1
fi

# Stop services
docker-compose -f docker-compose.prod.yml stop server

# Decompress backup
gunzip $BACKUP_FILE

# Copy backup to container
docker cp ${BACKUP_FILE%.gz} starships-neo4j-prod:/backups/

# Restore database
docker exec starships-neo4j-prod neo4j-admin database load \
  --from-path=/backups \
  --overwrite-destination=true \
  neo4j

# Restart services
docker-compose -f docker-compose.prod.yml start server

echo "Database restored from: $BACKUP_FILE"
```

## Troubleshooting

### Common Issues

#### 1. Container Creation Failures

```bash
# Check Docker daemon status
sudo systemctl status docker

# Check available disk space
df -h

# Check Docker socket permissions
ls -la /var/run/docker.sock

# View container logs
docker logs starships-server-prod
```

#### 2. Database Connection Issues

```bash
# Test Neo4j connection
docker exec starships-neo4j-prod cypher-shell -u neo4j -p password "RETURN 1"

# Check Neo4j logs
docker logs starships-neo4j-prod

# Verify network connectivity
docker exec starships-server-prod ping neo4j
```

#### 3. Performance Issues

```bash
# Monitor resource usage
docker stats

# Check container limits
docker inspect starships-server-prod | grep -A 10 "Resources"

# Monitor system resources
htop
iotop
```

### Log Analysis

```bash
# Search for errors in logs
docker logs starships-server-prod 2>&1 | grep -i error

# Monitor real-time logs
docker logs -f starships-server-prod

# Analyze MCP tool execution logs
grep "Tool execution" /app/logs/combined.log | tail -100
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- [ ] Check service health status
- [ ] Monitor resource usage
- [ ] Review error logs
- [ ] Verify backup completion

#### Weekly
- [ ] Update security patches
- [ ] Clean up old containers
- [ ] Rotate log files
- [ ] Performance analysis

#### Monthly
- [ ] Update dependencies
- [ ] Security audit
- [ ] Capacity planning
- [ ] Disaster recovery testing

### Automated Maintenance Scripts

```bash
#!/bin/bash
# maintenance.sh

# Clean up stopped containers
docker container prune -f

# Clean up unused images
docker image prune -f

# Clean up unused volumes
docker volume prune -f

# Clean up unused networks
docker network prune -f

# Restart services if needed
if [ "$(docker ps -q -f status=exited -f name=starships-server-prod)" ]; then
    docker-compose -f docker-compose.prod.yml restart server
fi

echo "Maintenance completed: $(date)"
```

Set up cron job:

```bash
# Add to crontab
0 2 * * * /path/to/maintenance.sh >> /var/log/maintenance.log 2>&1
```

This deployment guide provides a comprehensive approach to deploying the MCP Server in production with proper security, monitoring, and maintenance procedures.