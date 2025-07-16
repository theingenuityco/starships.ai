# MCP Server Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered when running the MCP (Model Context Protocol) Server, including diagnostic steps, error resolution, and performance optimization.

## Quick Diagnostic Commands

### System Health Check

```bash
# Check all services status
docker-compose ps

# Check MCP server health
curl -f http://localhost:3001/health
curl -f http://localhost:3002/health

# Check Docker daemon
sudo systemctl status docker

# Check available resources
df -h
free -h
docker system df
```

### Log Analysis

```bash
# View recent logs
docker logs --tail 100 starships-server-prod
docker logs --tail 100 starships-neo4j-prod

# Follow live logs
docker logs -f starships-server-prod

# Search for specific errors
docker logs starships-server-prod 2>&1 | grep -i "error\|failed\|exception"

# Check MCP-specific logs
grep "MCP\|Container\|Tool" /app/logs/combined.log | tail -50
```

## Common Issues and Solutions

### 1. Container Creation Failures

#### Symptoms
- Error: "Failed to create container for user"
- Docker socket connection errors
- Permission denied errors

#### Diagnostic Steps

```bash
# Check Docker socket permissions
ls -la /var/run/docker.sock

# Test Docker connectivity
docker ps

# Check available disk space
df -h /var/lib/docker

# Verify Docker daemon configuration
sudo cat /etc/docker/daemon.json

# Check system resources
free -h
```

#### Solutions

**Permission Issues:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Fix socket permissions
sudo chmod 666 /var/run/docker.sock

# Restart Docker service
sudo systemctl restart docker
```

**Resource Issues:**
```bash
# Clean up unused containers
docker container prune -f

# Clean up unused images
docker image prune -f

# Clean up unused volumes
docker volume prune -f

# Check and increase disk space
sudo du -sh /var/lib/docker/*
```

**Docker Daemon Issues:**
```bash
# Restart Docker daemon
sudo systemctl restart docker

# Check Docker daemon logs
sudo journalctl -u docker.service -f

# Verify Docker configuration
docker info
```

### 2. Database Connection Problems

#### Symptoms
- "Failed to connect to Neo4j"
- Database timeout errors
- Schema initialization failures

#### Diagnostic Steps

```bash
# Test Neo4j connectivity
docker exec starships-neo4j-prod cypher-shell -u neo4j -p password "RETURN 1"

# Check Neo4j container status
docker inspect starships-neo4j-prod

# Verify network connectivity
docker exec starships-server-prod ping neo4j

# Check Neo4j logs
docker logs starships-neo4j-prod | tail -100
```

#### Solutions

**Connection Issues:**
```bash
# Restart Neo4j container
docker restart starships-neo4j-prod

# Check Neo4j configuration
docker exec starships-neo4j-prod cat /var/lib/neo4j/conf/neo4j.conf

# Verify environment variables
docker exec starships-neo4j-prod env | grep NEO4J
```

**Authentication Issues:**
```bash
# Reset Neo4j password
docker exec starships-neo4j-prod neo4j-admin set-initial-password newpassword

# Update environment variables
# Edit .env file with correct credentials
```

**Network Issues:**
```bash
# Check Docker networks
docker network ls
docker network inspect starships-network

# Recreate network if needed
docker network rm starships-network
docker network create starships-network
```

### 3. Tool Execution Failures

#### Symptoms
- "Tool execution failed"
- Container timeout errors
- Permission denied for tool execution

#### Diagnostic Steps

```bash
# Check user containers
docker ps --filter "label=starships.type=mcp-tools"

# Inspect specific user container
docker inspect starships-user-{userId}-mcp-tools

# Check container logs
docker logs starships-user-{userId}-mcp-tools

# Test tool execution manually
docker exec starships-user-{userId}-mcp-tools python3 /app/tools/executor.py web_scraper '{"url":"https://example.com"}'
```

#### Solutions

**Container Issues:**
```bash
# Restart user container
docker restart starships-user-{userId}-mcp-tools

# Recreate user container
# Use MCP API to reconfigure user tools

# Check container resource limits
docker stats starships-user-{userId}-mcp-tools
```

**Tool Configuration Issues:**
```bash
# Verify tool registration
curl -H "Authorization: Bearer {token}" \
  http://localhost:3001/api/mcp/tools/{userId}

# Check agent permissions
curl -H "Authorization: Bearer {token}" \
  http://localhost:3001/api/mcp/agents/{agentId}/permissions

# Validate tool parameters
# Check tool schema and required parameters
```

**Network Issues:**
```bash
# Check MCP tools network
docker network inspect mcp-tools-network

# Test network connectivity from container
docker exec starships-user-{userId}-mcp-tools ping 8.8.8.8
```

### 4. Authentication and Authorization Issues

#### Symptoms
- "Unauthorized" errors
- JWT token validation failures
- Permission denied errors

#### Diagnostic Steps

```bash
# Check JWT token validity
# Use online JWT decoder or:
node -e "console.log(JSON.parse(Buffer.from('${JWT_TOKEN}'.split('.')[1], 'base64')))"

# Verify Kinde configuration
curl -X GET "https://${KINDE_DOMAIN}/.well-known/openid_configuration"

# Check authentication middleware logs
grep "auth\|jwt\|token" /app/logs/combined.log | tail -20
```

#### Solutions

**Token Issues:**
```bash
# Generate new JWT token
# Use your authentication system to get fresh token

# Verify token format
# Ensure Bearer prefix: "Bearer your-jwt-token"

# Check token expiration
# Tokens may need refresh
```

**Kinde Configuration:**
```bash
# Verify environment variables
echo $KINDE_DOMAIN
echo $KINDE_CLIENT_ID
# Don't echo KINDE_CLIENT_SECRET for security

# Test Kinde connectivity
curl -f "https://${KINDE_DOMAIN}/.well-known/openid_configuration"
```

### 5. Performance Issues

#### Symptoms
- Slow response times
- High memory usage
- Container resource exhaustion

#### Diagnostic Steps

```bash
# Monitor system resources
htop
iotop
docker stats

# Check container resource usage
docker exec starships-server-prod cat /proc/meminfo
docker exec starships-server-prod cat /proc/loadavg

# Analyze slow queries
grep "slow\|timeout" /app/logs/combined.log

# Check Neo4j performance
docker exec starships-neo4j-prod cypher-shell -u neo4j -p password \
  "CALL dbms.listQueries() YIELD query, elapsedTimeMillis WHERE elapsedTimeMillis > 1000 RETURN query, elapsedTimeMillis"
```

#### Solutions

**Memory Issues:**
```bash
# Increase container memory limits
# Edit docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 2G

# Clean up memory leaks
docker restart starships-server-prod

# Optimize Neo4j memory
# Edit Neo4j configuration:
# NEO4J_dbms_memory_heap_max__size=2G
# NEO4J_dbms_memory_pagecache_size=1G
```

**CPU Issues:**
```bash
# Increase CPU limits
# Edit docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       cpus: '2.0'

# Optimize container resource allocation
# Reduce number of concurrent user containers
```

**Database Performance:**
```bash
# Create database indexes
docker exec starships-neo4j-prod cypher-shell -u neo4j -p password \
  "CREATE INDEX user_id_index IF NOT EXISTS FOR (u:User) ON (u.id)"

# Analyze query performance
# Use EXPLAIN and PROFILE in Cypher queries

# Clean up old data
# Implement data retention policies
```

### 6. Network and Connectivity Issues

#### Symptoms
- Connection timeouts
- DNS resolution failures
- Port binding errors

#### Diagnostic Steps

```bash
# Check port availability
netstat -tulpn | grep :3001
netstat -tulpn | grep :3002

# Test network connectivity
telnet localhost 3001
curl -v http://localhost:3001/health

# Check DNS resolution
nslookup your-domain.com
dig your-domain.com

# Verify firewall rules
sudo ufw status
sudo iptables -L
```

#### Solutions

**Port Conflicts:**
```bash
# Find process using port
sudo lsof -i :3001

# Kill conflicting process
sudo kill -9 {PID}

# Change port configuration
# Edit .env file:
# PORT=3003
```

**DNS Issues:**
```bash
# Update DNS configuration
sudo systemctl restart systemd-resolved

# Check /etc/hosts file
cat /etc/hosts

# Test with IP address instead of hostname
curl http://127.0.0.1:3001/health
```

**Firewall Issues:**
```bash
# Allow required ports
sudo ufw allow 3001/tcp
sudo ufw allow 3002/tcp

# Check iptables rules
sudo iptables -L INPUT -v -n
```

## Error Code Reference

### HTTP Status Codes

| Code | Meaning | Common Causes | Solutions |
|------|---------|---------------|-----------|
| 400 | Bad Request | Invalid parameters, malformed JSON | Validate request format and parameters |
| 401 | Unauthorized | Missing/invalid JWT token | Check authentication token |
| 403 | Forbidden | Insufficient permissions | Verify user/agent permissions |
| 404 | Not Found | Resource doesn't exist | Check resource IDs and endpoints |
| 429 | Too Many Requests | Rate limit exceeded | Implement backoff strategy |
| 500 | Internal Server Error | Server-side error | Check server logs |
| 503 | Service Unavailable | Service temporarily down | Check service health |

### MCP-Specific Error Codes

| Code | Description | Troubleshooting |
|------|-------------|-----------------|
| `CONTAINER_ERROR` | Docker container operation failed | Check Docker daemon and permissions |
| `TOOL_EXECUTION_FAILED` | Tool execution error | Verify tool parameters and container status |
| `PERMISSION_DENIED` | Agent lacks tool permission | Check agent permissions configuration |
| `CREDENTIAL_ERROR` | Agent credential issue | Verify encrypted credentials |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement request throttling |
| `VALIDATION_ERROR` | Input validation failed | Check parameter format and requirements |

## Performance Optimization

### Container Optimization

```bash
# Optimize Docker settings
sudo tee /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
EOF

sudo systemctl restart docker
```

### Database Optimization

```bash
# Neo4j performance tuning
docker exec starships-neo4j-prod tee -a /var/lib/neo4j/conf/neo4j.conf <<EOF
# Memory settings
dbms.memory.heap.initial_size=1G
dbms.memory.heap.max_size=2G
dbms.memory.pagecache.size=1G

# Query performance
cypher.default_language_version=4
cypher.forbid_exhaustive_shortestpath=true
cypher.hints_error=true

# Connection pooling
dbms.connector.bolt.thread_pool_min_size=5
dbms.connector.bolt.thread_pool_max_size=400
EOF

docker restart starships-neo4j-prod
```

### Application Optimization

```typescript
// Implement connection pooling
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD),
  {
    maxConnectionPoolSize: 100,
    connectionAcquisitionTimeout: 60000,
    connectionTimeout: 20000,
    maxTransactionRetryTime: 15000
  }
);

// Implement caching
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes

// Cache frequently accessed data
const getCachedUserTools = async (userId: string) => {
  const cacheKey = `user-tools-${userId}`;
  let tools = cache.get(cacheKey);
  
  if (!tools) {
    tools = await toolRegistry.getUserTools(userId);
    cache.set(cacheKey, tools);
  }
  
  return tools;
};
```

## Monitoring and Alerting

### Health Check Scripts

```bash
#!/bin/bash
# health-check.sh

# Check service health
check_service() {
  local service=$1
  local url=$2
  
  if curl -f -s "$url" > /dev/null; then
    echo "✅ $service is healthy"
    return 0
  else
    echo "❌ $service is unhealthy"
    return 1
  fi
}

# Check all services
check_service "Main Server" "http://localhost:3001/health"
check_service "MCP Server" "http://localhost:3002/health"

# Check Docker containers
if docker ps --filter "name=starships" --format "table {{.Names}}\t{{.Status}}" | grep -q "Up"; then
  echo "✅ Docker containers are running"
else
  echo "❌ Some Docker containers are down"
  docker ps --filter "name=starships" --format "table {{.Names}}\t{{.Status}}"
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
  echo "⚠️  Disk usage is high: ${DISK_USAGE}%"
else
  echo "✅ Disk usage is normal: ${DISK_USAGE}%"
fi
```

### Automated Alerts

```bash
#!/bin/bash
# alert.sh

WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

send_alert() {
  local message=$1
  local severity=$2
  
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"[$severity] MCP Server Alert: $message\"}" \
    "$WEBHOOK_URL"
}

# Check for critical errors
ERROR_COUNT=$(docker logs starships-server-prod --since 5m 2>&1 | grep -c "ERROR\|FATAL")

if [ "$ERROR_COUNT" -gt 10 ]; then
  send_alert "High error rate detected: $ERROR_COUNT errors in last 5 minutes" "CRITICAL"
fi

# Check container health
UNHEALTHY_CONTAINERS=$(docker ps --filter "health=unhealthy" -q | wc -l)

if [ "$UNHEALTHY_CONTAINERS" -gt 0 ]; then
  send_alert "$UNHEALTHY_CONTAINERS unhealthy containers detected" "WARNING"
fi
```

## Recovery Procedures

### Service Recovery

```bash
#!/bin/bash
# recover-services.sh

echo "Starting service recovery..."

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Clean up resources
docker system prune -f

# Restart services
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
sleep 30

# Verify recovery
if curl -f http://localhost:3001/health && curl -f http://localhost:3002/health; then
  echo "✅ Services recovered successfully"
else
  echo "❌ Service recovery failed"
  exit 1
fi
```

### Database Recovery

```bash
#!/bin/bash
# recover-database.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

echo "Starting database recovery from $BACKUP_FILE..."

# Stop dependent services
docker-compose -f docker-compose.prod.yml stop server

# Stop Neo4j
docker-compose -f docker-compose.prod.yml stop neo4j

# Remove old data
docker volume rm starships_neo4j_data

# Start Neo4j
docker-compose -f docker-compose.prod.yml up -d neo4j

# Wait for Neo4j to be ready
sleep 30

# Restore from backup
docker exec starships-neo4j-prod neo4j-admin database load \
  --from-path=/backups \
  --overwrite-destination=true \
  neo4j < "$BACKUP_FILE"

# Start all services
docker-compose -f docker-compose.prod.yml up -d

echo "✅ Database recovery completed"
```

## Best Practices

### Preventive Measures

1. **Regular Monitoring**
   - Set up automated health checks
   - Monitor resource usage trends
   - Track error rates and patterns

2. **Proactive Maintenance**
   - Regular container cleanup
   - Database optimization
   - Log rotation and archival

3. **Backup Strategy**
   - Daily database backups
   - Configuration backups
   - Container state snapshots

4. **Security Hardening**
   - Regular security updates
   - Access control reviews
   - Vulnerability scanning

### Emergency Response

1. **Incident Response Plan**
   - Define escalation procedures
   - Maintain contact information
   - Document recovery steps

2. **Communication**
   - Status page updates
   - User notifications
   - Team coordination

3. **Post-Incident Review**
   - Root cause analysis
   - Process improvements
   - Documentation updates

## Getting Help

### Internal Resources
- Check application logs: `/app/logs/`
- Review configuration: `.env` files
- Consult API documentation: `docs/API.md`
- Check deployment guide: `docs/DEPLOYMENT.md`

### External Resources
- Docker documentation: https://docs.docker.com/
- Neo4j documentation: https://neo4j.com/docs/
- Node.js troubleshooting: https://nodejs.org/en/docs/

### Support Channels
- Create GitHub issue with logs and error details
- Include system information and reproduction steps
- Provide relevant configuration (sanitized)

Remember to sanitize sensitive information (passwords, tokens, etc.) before sharing logs or configurations.