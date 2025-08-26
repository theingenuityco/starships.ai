#!/bin/bash
# Neo4j Backup Script for Production

NAMESPACE="starships-prod"
POD=$(kubectl get pods -n $NAMESPACE -l app=starships-ai -o jsonpath="{.items[0].metadata.name}")
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="neo4j-backup-$DATE"
BACKUP_DIR="./backups"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

if [ -z "$POD" ]; then
    echo "Error: No pod found in namespace $NAMESPACE"
    exit 1
fi

echo "Starting backup of Neo4j database from pod: $POD"

# Create backup inside pod
kubectl exec -n $NAMESPACE $POD -- neo4j-admin database dump --to=/tmp/$BACKUP_NAME.dump neo4j

# Copy backup to local
kubectl cp $NAMESPACE/$POD:/tmp/$BACKUP_NAME.dump $BACKUP_DIR/$BACKUP_NAME.dump

# Clean up backup from pod
kubectl exec -n $NAMESPACE $POD -- rm /tmp/$BACKUP_NAME.dump

# Verify backup was created
if [ -f "$BACKUP_DIR/$BACKUP_NAME.dump" ]; then
    echo "Backup completed successfully: $BACKUP_DIR/$BACKUP_NAME.dump"
    ls -lh "$BACKUP_DIR/$BACKUP_NAME.dump"
else
    echo "Error: Backup file was not created"
    exit 1
fi

# Optional: Upload to DigitalOcean Spaces or S3
# Uncomment and configure if you have spaces/S3 set up
# doctl spaces upload $BACKUP_DIR/$BACKUP_NAME.dump s3://starships-backups/neo4j/$BACKUP_NAME.dump

# Keep only last 7 days of backups locally
find $BACKUP_DIR -name "neo4j-backup-*.dump" -mtime +7 -delete

echo "Backup process completed"