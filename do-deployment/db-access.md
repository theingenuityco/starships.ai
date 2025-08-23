# Database Access Guide

## Neo4j Database Access Methods

### Method 1: Port Forwarding (For GUI Access)
```bash
# Forward Neo4j ports to your local machine
kubectl port-forward deployment/starships-all -n starships-prod 7474:7474 7687:7687

# Then access:
# Browser: http://localhost:7474
# Bolt: [NEO4J-LOCAL-URL]
# Username: neo4j
# Password: [DEFAULT-PASSWORD]
```

### Method 2: Direct Cypher Shell Access
```bash
# Run Cypher queries directly in the pod
kubectl exec -it deployment/starships-all -n starships-prod -- /opt/neo4j/bin/cypher-shell -u neo4j -p [DEFAULT-PASSWORD]

# Example queries:
# MATCH (n) RETURN count(n);
# MATCH (n) RETURN n LIMIT 25;
# CREATE (n:Test {name: 'TestNode'}) RETURN n;
```

### Method 3: Backup Database
```bash
# Create a backup
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/neo4j-admin database dump neo4j --to-path=/tmp/

# Copy backup to local machine
kubectl cp starships-prod/$(kubectl get pod -l app=starships-all -n starships-prod -o name | cut -d/ -f2):/tmp/neo4j.dump ./neo4j-backup.dump
```

### Method 4: View Database Stats
```bash
# Quick database statistics
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/cypher-shell -u neo4j -p [DEFAULT-PASSWORD] "CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition"

# Count all nodes
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/cypher-shell -u neo4j -p [DEFAULT-PASSWORD] "MATCH (n) RETURN count(n) as nodeCount"

# Show all node labels
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/cypher-shell -u neo4j -p [DEFAULT-PASSWORD] "CALL db.labels() YIELD label RETURN label"
```

### Method 5: Remote Connection Setup
If you want to expose Neo4j publicly (NOT recommended for production):

```yaml
# Create a separate service for Neo4j (neo4j-external.yaml)
apiVersion: v1
kind: Service
metadata:
  name: neo4j-external
  namespace: starships-prod
spec:
  type: LoadBalancer
  ports:
  - port: 7474
    targetPort: 7474
    name: http
  - port: 7687
    targetPort: 7687
    name: bolt
  selector:
    app: starships-all
```

Then apply: `kubectl apply -f neo4j-external.yaml`

### Method 6: Use a Desktop Neo4j Client
1. Set up port forwarding (Method 1)
2. Use Neo4j Desktop or any Neo4j client
3. Connect to: `[NEO4J-LOCAL-URL]`
4. Credentials: neo4j / [DEFAULT-PASSWORD]

## Common Database Operations

### Check Database Health
```bash
kubectl exec deployment/starships-all -n starships-prod -- curl -s http://localhost:7474/db/neo4j/cluster/available
```

### View Logs
```bash
kubectl exec deployment/starships-all -n starships-prod -- tail -f /opt/neo4j/logs/neo4j.log
```

### Reset Database (CAREFUL!)
```bash
# Stop Neo4j
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/neo4j stop

# Clear data
kubectl exec deployment/starships-all -n starships-prod -- rm -rf /var/lib/neo4j/data/databases/neo4j

# Start Neo4j
kubectl exec deployment/starships-all -n starships-prod -- /opt/neo4j/bin/neo4j start
```

## Connection from Your Application Code

Your backend connects internally using:
- **URI**: `[NEO4J-LOCAL-URL]`
- **Username**: `neo4j`
- **Password**: `[DEFAULT-PASSWORD]`

## Security Notes
- Current setup uses default [DEFAULT-PASSWORD] (change for production!)
- Port forwarding is secure (only accessible from your machine)
- Don't expose Neo4j publicly without proper security