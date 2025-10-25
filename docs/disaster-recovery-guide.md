# Starships.ai - Disaster Recovery Procedure

## Overview

This document outlines the disaster recovery process for the Starships.ai production PostgreSQL database running on AWS EKS. The recovery process uses AWS Backup to create daily encrypted snapshots of the EBS volume containing the PostgreSQL data.

**Recovery Time Objective (RTO):** 15-20 minutes
**Recovery Point Objective (RPO):** 24 hours (daily backups at 04:00 IST)

---

## Table of Contents

1. [Backup Configuration](#backup-configuration)
2. [Daily Operations](#daily-operations)
3. [Disaster Recovery Process](#disaster-recovery-process)
4. [Verification Procedures](#verification-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Cost Information](#cost-information)

---

## Backup Configuration

### AWS Backup Plan

- **Plan Name:** `starships-postgres-daily-backup`
- **Backup Rule:** `daily-postgres-snapshots`
- **Backup Vault:** `starships-production-backups`
- **Region:** ap-south-1 (Mumbai)

### Schedule

- **Frequency:** Daily
- **Start Time:** 04:00 IST (02:00 UTC)
- **Backup Window:** Start within 1 hour, complete within 2 hours
- **Retention:** 90 days
- **Lifecycle:** Warm storage only (no cold storage)

### Protected Resource

- **Resource Type:** EBS Volume
- **Current Volume ID:** Get dynamically using:
  ```bash
  kubectl get pv -o jsonpath='{.items[?(@.spec.claimRef.name=="starships-data-starships-app-0")].spec.csi.volumeHandle}'
  ```
- **Size:** 30 GB
- **Type:** gp3 (encrypted with KMS)
- **Selection Method:** Tag-based (automatic protection for restored volumes)
- **Tag Filter:** `BackupPolicy=starships-postgres-production`

**Important:** Tag-based selection automatically protects any volume with the matching tag, including restored volumes after disaster recovery. When restoring from backup, ensure the new volume is tagged with `BackupPolicy=starships-postgres-production` to enable automatic backup protection.

### IAM Role

- **Role:** `AWSBackupDefaultServiceRole`
- **Permissions:** Managed by AWS Backup service

---

## Daily Operations

### Verify Backups

**Check last backup status:**
```bash
# Via AWS Console
AWS Backup > Jobs > Filter by last 24 hours

# Via CLI
aws backup list-backup-jobs \
  --region ap-south-1 \
  --by-created-after $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --output table
```

**List available recovery points:**
```bash
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name starships-production-backups \
  --region ap-south-1 \
  --max-results 10 \
  --output table
```

### Monitor Backup Health

**Check backup plan status:**
```bash
aws backup describe-backup-plan \
  --backup-plan-id $(aws backup list-backup-plans \
    --region ap-south-1 \
    --query 'BackupPlansList[?BackupPlanName==`starships-postgres-daily-backup`].BackupPlanId' \
    --output text) \
  --region ap-south-1
```

---

## Disaster Recovery Process

### Prerequisites

- AWS CLI configured with appropriate credentials
- kubectl configured for starships-prod cluster
- Cluster context: `your-user@starships-prod.ap-south-1.eksctl.io`

**Set environment variables:**
```bash
# Get AWS Account ID dynamically
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $AWS_ACCOUNT_ID"

# Verify AWS region
export AWS_REGION="ap-south-1"
echo "AWS Region: $AWS_REGION"
```

**Security Considerations:**

⚠️ **Database Credentials:**
- This guide uses `postgres` as the default database user for simplicity
- In production, ensure database credentials are stored securely in Kubernetes Secrets
- Never hardcode passwords in scripts or documentation
- Consider using AWS Secrets Manager or HashiCorp Vault for credential management
- Rotate database passwords regularly following your security policy

⚠️ **Access Control:**
- Ensure only authorized personnel have access to:
  - AWS Console and CLI credentials
  - kubectl access to production namespace
  - Database connection strings and passwords
- All recovery operations should be logged and audited

### Step 1: Assess the Situation

**Identify the issue:**
```bash
# Check database connectivity
kubectl exec starships-app-0 -n starships-prod -- \
  psql -U postgres -d starships -c "SELECT COUNT(*) FROM users;"

# Check pod status
kubectl get pods -n starships-prod -l app=starships-ai

# Check volume status
kubectl get pvc -n starships-prod
kubectl get pv
```

**Document current state:**
```bash
# Save current data counts for verification
kubectl exec starships-app-0 -n starships-prod -- \
  psql -U postgres -d starships -c "\dt" > /tmp/tables-before-recovery.txt

# Save PV/PVC configuration
kubectl get pv -o yaml > /tmp/pv-before-recovery.yaml
kubectl get pvc -n starships-prod -o yaml > /tmp/pvc-before-recovery.yaml
```

### Step 2: Identify Latest Backup

**Find the most recent snapshot:**
```bash
# List recovery points
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name starships-production-backups \
  --region ap-south-1 \
  --query 'RecoveryPoints[?Status==`COMPLETED`].[RecoveryPointArn,CreationDate,BackupSizeInBytes]' \
  --output table

# Or use AWS Console:
# AWS Backup > Backup vaults > starships-production-backups > Recovery points
```

**Extract snapshot ID from recovery point ARN:**
```bash
# Recovery point ARN format: arn:aws:ec2:ap-south-1::snapshot/snap-XXXXX
# Extract snapshot ID: snap-XXXXX
SNAPSHOT_ID="snap-XXXXX"  # Replace with actual snapshot ID
```

### Step 3: Stop the Application

**Scale down the StatefulSet:**
```bash
# Scale down to stop database writes
kubectl scale statefulset starships-app -n starships-prod --replicas=0

# Wait for pod to terminate
kubectl wait --for=delete pod/starships-app-0 -n starships-prod --timeout=120s

# Verify pod is terminated
POD_COUNT=$(kubectl get pods -n starships-prod -l app=starships-ai --no-headers 2>/dev/null | wc -l)
if [ "$POD_COUNT" -ne 0 ]; then
  echo "❌ ERROR: Pod failed to terminate"
  kubectl get pods -n starships-prod -l app=starships-ai
  exit 1
fi

echo "✅ Pod terminated successfully"
```

### Step 4: Create Volume from Backup

**Determine the correct availability zone:**
```bash
# Get AZ where cluster nodes are running
NODE_AZ=$(kubectl get nodes -o jsonpath='{.items[0].metadata.labels.topology\.kubernetes\.io/zone}')
echo "Cluster nodes are in AZ: $NODE_AZ"

# Alternatively, get AZ from existing PV
EXISTING_AZ=$(kubectl get pv -o jsonpath='{.items[?(@.spec.claimRef.name=="starships-data-starships-app-0")].spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[?(@.key=="topology.kubernetes.io/zone")].values[0]}')
echo "Existing volume AZ: $EXISTING_AZ"
```

**Create new EBS volume from snapshot:**
```bash
# Create volume in same availability zone as cluster nodes
NEW_VOLUME_ID=$(aws ec2 create-volume \
  --snapshot-id $SNAPSHOT_ID \
  --availability-zone ${NODE_AZ:-ap-south-1a} \
  --volume-type gp3 \
  --encrypted \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=starships-prod-postgres-data},{Key=kubernetes.io/created-for/pvc/namespace,Value=starships-prod},{Key=BackupPolicy,Value=starships-postgres-production},{Key=RestoredFrom,Value='$SNAPSHOT_ID'}]' \
  --region ap-south-1 \
  --query 'VolumeId' \
  --output text)

echo "New Volume ID: $NEW_VOLUME_ID"

# Verify volume was created successfully
if [ -z "$NEW_VOLUME_ID" ]; then
  echo "❌ ERROR: Failed to create volume from snapshot"
  exit 1
fi

# Wait for volume to become available
echo "Waiting for volume to be available..."
aws ec2 wait volume-available --volume-ids $NEW_VOLUME_ID --region ap-south-1

# Verify volume status
VOLUME_STATE=$(aws ec2 describe-volumes \
  --volume-ids $NEW_VOLUME_ID \
  --region ap-south-1 \
  --query 'Volumes[0].State' \
  --output text)

if [ "$VOLUME_STATE" != "available" ]; then
  echo "❌ ERROR: Volume is not available. Current state: $VOLUME_STATE"
  exit 1
fi

echo "✅ Volume is available!"
aws ec2 describe-volumes \
  --volume-ids $NEW_VOLUME_ID \
  --region ap-south-1 \
  --query 'Volumes[0].{VolumeId:VolumeId,State:State,Size:Size,AvailabilityZone:AvailabilityZone}' \
  --output table
```

### Step 5: Update Kubernetes Resources

**Get current PV/PVC names:**
```bash
# Get PV name
PV_NAME=$(kubectl get pvc starships-data-starships-app-0 -n starships-prod -o jsonpath='{.spec.volumeName}')
echo "Current PV: $PV_NAME"

# Get PVC UID (needed for binding)
PVC_UID=$(kubectl get pvc starships-data-starships-app-0 -n starships-prod -o jsonpath='{.metadata.uid}')
echo "PVC UID: $PVC_UID"
```

**Delete PVC and PV:**
```bash
# Delete PVC (StatefulSet will recreate it)
kubectl delete pvc starships-data-starships-app-0 -n starships-prod

# Delete PV
kubectl delete pv $PV_NAME
```

**Create new PV with restored volume:**
```bash
# Create PV manifest
cat > /tmp/pv-restored.yaml <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  annotations:
    pv.kubernetes.io/provisioned-by: ebs.csi.aws.com
  finalizers:
  - kubernetes.io/pv-protection
  name: $PV_NAME
spec:
  accessModes:
  - ReadWriteOnce
  capacity:
    storage: 30Gi
  csi:
    driver: ebs.csi.aws.com
    fsType: ext4
    volumeHandle: $NEW_VOLUME_ID
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: topology.kubernetes.io/zone
          operator: In
          values:
          - ${NODE_AZ:-ap-south-1a}
  persistentVolumeReclaimPolicy: Retain
  storageClassName: gp3
  volumeMode: Filesystem
EOF

# Apply the PV
kubectl apply -f /tmp/pv-restored.yaml

if [ $? -ne 0 ]; then
  echo "❌ ERROR: Failed to create PV"
  exit 1
fi

# Make PV available for binding
kubectl patch pv $PV_NAME -p '{"spec":{"claimRef":null}}'

# Verify PV is available
PV_PHASE=$(kubectl get pv $PV_NAME -o jsonpath='{.status.phase}')
if [ "$PV_PHASE" != "Available" ]; then
  echo "❌ ERROR: PV is not available. Current phase: $PV_PHASE"
  exit 1
fi

echo "✅ PV is available and ready for binding"
```

### Step 6: Restore Application

**Scale up StatefulSet:**
```bash
# Scale up (will automatically create PVC and bind to available PV)
kubectl scale statefulset starships-app -n starships-prod --replicas=1

# Monitor PVC creation and binding
watch kubectl get pvc -n starships-prod
# Wait until STATUS shows "Bound"

# Wait for pod to be ready
kubectl wait --for=condition=ready pod/starships-app-0 -n starships-prod --timeout=300s

if [ $? -ne 0 ]; then
  echo "❌ ERROR: Pod failed to become ready"
  kubectl describe pod starships-app-0 -n starships-prod
  exit 1
fi

# Check pod status
POD_STATUS=$(kubectl get pod starships-app-0 -n starships-prod -o jsonpath='{.status.phase}')
echo "✅ Pod is ready! Status: $POD_STATUS"
kubectl get pods -n starships-prod -l app=starships-ai
```

### Step 7: Verify AWS Backup Protection

**✅ AUTOMATIC PROTECTION:** If you followed Step 4 correctly and tagged the new volume with `BackupPolicy=starships-postgres-production`, the volume is automatically protected. No manual update needed!

**Verify backup protection:**
```bash
# Verify the new volume has the correct backup tag
aws ec2 describe-volumes \
  --volume-ids $NEW_VOLUME_ID \
  --region ap-south-1 \
  --query 'Volumes[0].Tags[?Key==`BackupPolicy`]' \
  --output table

# Expected output: BackupPolicy = starships-postgres-production
```

**Check that backups will occur:**
```bash
# List all volumes that will be backed up (should only show your new volume)
aws ec2 describe-volumes \
  --region ap-south-1 \
  --filters "Name=tag:BackupPolicy,Values=starships-postgres-production" \
  --query 'Volumes[*].{VolumeId:VolumeId,Name:Tags[?Key==`Name`]|[0].Value}' \
  --output table
```

**If the tag is missing (fix it):**
```bash
# Add the backup tag to the new volume
aws ec2 create-tags \
  --resources $NEW_VOLUME_ID \
  --tags Key=BackupPolicy,Value=starships-postgres-production \
  --region ap-south-1

echo "✅ Backup tag added. Volume will be automatically backed up at next scheduled time (04:00 IST)"
```

---

## Verification Procedures

### Verify Data Recovery

**Check database connectivity:**
```bash
kubectl exec starships-app-0 -n starships-prod -- \
  psql -U postgres -d starships -c "SELECT version();"
```

**Verify table counts:**
```bash
# Check critical tables
kubectl exec starships-app-0 -n starships-prod -- \
  psql -U postgres -d starships -c "
    SELECT
      'users' as table_name, COUNT(*) as count FROM users
    UNION ALL
    SELECT 'conversations', COUNT(*) FROM conversations
    UNION ALL
    SELECT 'messages', COUNT(*) FROM messages
    UNION ALL
    SELECT 'starships', COUNT(*) FROM starships;
  "
```

**Verify recent data:**
```bash
# Check most recent users
kubectl exec starships-app-0 -n starships-prod -- \
  psql -U postgres -d starships -c "
    SELECT email, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 5;
  " -x
```

### Verify Volume Configuration

**Check volume attachment:**
```bash
# Verify correct volume is attached
aws ec2 describe-volumes \
  --volume-ids $NEW_VOLUME_ID \
  --region ap-south-1 \
  --query 'Volumes[0].Attachments[0].{VolumeId:VolumeId,Instance:InstanceId,Device:Device,State:State}' \
  --output table

# Verify from inside pod
kubectl exec starships-app-0 -n starships-prod -- df -h | grep nvme
```

### Verify Application Health

**Check health endpoints:**
```bash
# Backend health check
kubectl exec starships-app-0 -n starships-prod -- \
  wget -q -O- http://localhost:4000/api/v1/health

# Check all services are running
kubectl exec starships-app-0 -n starships-prod -- ps aux | grep -E "postgres|node|next"
```

**Test application functionality:**
```bash
# Get LoadBalancer URL
kubectl get ingress -n starships-prod -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}'

# Test frontend (replace with your domain)
curl -I https://starships.ai

# Test API
curl -I https://starships.ai/api/v1/health
```

---

## Troubleshooting

### Issue: PVC Not Binding to PV

**Symptoms:**
- PVC stuck in "Pending" state
- PV shows "Available" instead of "Bound"

**Solution:**
```bash
# Check PVC and PV compatibility
kubectl describe pvc starships-data-starships-app-0 -n starships-prod
kubectl describe pv $PV_NAME

# Verify storage class matches
kubectl get pvc starships-data-starships-app-0 -n starships-prod -o jsonpath='{.spec.storageClassName}'
kubectl get pv $PV_NAME -o jsonpath='{.spec.storageClassName}'

# Check node affinity
kubectl get pv $PV_NAME -o jsonpath='{.spec.nodeAffinity}'

# Force binding by patching PV with correct claimRef
kubectl patch pv $PV_NAME -p '{"spec":{"claimRef":{"name":"starships-data-starships-app-0","namespace":"starships-prod","uid":"'$PVC_UID'"}}}'
```

### Issue: Pod Fails to Start After Recovery

**Symptoms:**
- Pod stuck in "Pending" or "ContainerCreating"
- Volume mount errors

**Solution:**
```bash
# Check pod events
kubectl describe pod starships-app-0 -n starships-prod

# Check volume attachment status
kubectl get volumeattachment

# Verify EBS CSI driver is running
kubectl get pods -n kube-system -l app=ebs-csi-controller

# Check node where pod is scheduled
kubectl get pod starships-app-0 -n starships-prod -o jsonpath='{.spec.nodeName}'

# Ensure volume is in same AZ as node
aws ec2 describe-volumes --volume-ids $NEW_VOLUME_ID --region ap-south-1 --query 'Volumes[0].AvailabilityZone'
```

### Issue: Data Corruption After Recovery

**Symptoms:**
- Database shows fewer records than expected
- Recent data is missing

**Solution:**
```bash
# Check which snapshot was used
aws ec2 describe-snapshots --snapshot-ids $SNAPSHOT_ID --region ap-south-1 \
  --query 'Snapshots[0].{SnapshotId:SnapshotId,StartTime:StartTime,VolumeId:VolumeId}'

# List all available snapshots to find a better recovery point
aws ec2 describe-snapshots \
  --region ap-south-1 \
  --owner-ids self \
  --filters "Name=tag:kubernetes.io/created-for/pvc/namespace,Values=starships-prod" \
  --query 'Snapshots[*].{ID:SnapshotId,Time:StartTime,Size:VolumeSize}' \
  --output table

# Repeat recovery process with a different snapshot
```

### Issue: Old Volume Not Detaching

**Symptoms:**
- Old corrupted volume still shows "in-use"
- Cannot delete old volume

**Solution:**
```bash
# Force detach (only if pod is already terminated)
OLD_VOLUME_ID="vol-XXXXX"
aws ec2 detach-volume --volume-id $OLD_VOLUME_ID --region ap-south-1 --force

# Wait for detachment
aws ec2 wait volume-available --volume-ids $OLD_VOLUME_ID --region ap-south-1

# Then delete
aws ec2 delete-volume --volume-id $OLD_VOLUME_ID --region ap-south-1
```

---

## Post-Recovery Tasks

### 1. Update AWS Backup Configuration

**⚠️ MOST IMPORTANT:** Verify AWS Backup is protecting the new restored volume.

```bash
# Get backup plan ID dynamically
BACKUP_PLAN_ID=$(aws backup list-backup-plans --region ap-south-1 \
  --query 'BackupPlansList[?BackupPlanName==`starships-postgres-daily-backup`].BackupPlanId' \
  --output text)

# Verify backup is configured for new volume
aws backup list-backup-selections \
  --backup-plan-id $BACKUP_PLAN_ID \
  --region ap-south-1

# Check protected resources
aws backup list-protected-resources --region ap-south-1 | grep vol-
```

**If not automatically protected:** Follow Step 7 from the recovery process above to update the backup selection.

### 2. Update Documentation

1. **Record the incident:**
   - Date and time of disaster
   - Root cause (if known)
   - Data loss extent (time range)
   - Recovery time achieved
   - New volume ID after recovery

2. **Update runbook:**
   - Any issues encountered
   - Solutions that worked
   - Improvements needed

### 3. Cleanup

**Delete old corrupted volume:**
```bash
# Only after confirming recovery is successful AND backups are configured for new volume
OLD_VOLUME_ID="vol-XXXXX"  # Original corrupted volume

# Verify it's not in use
aws ec2 describe-volumes --volume-ids $OLD_VOLUME_ID --region ap-south-1 \
  --query 'Volumes[0].State'

# Delete (saves ~$1.50/month per 30GB)
aws ec2 delete-volume --volume-id $OLD_VOLUME_ID --region ap-south-1
```

**⚠️ Do not delete the old volume until:**
1. ✅ New volume is working correctly
2. ✅ Data is verified
3. ✅ AWS Backup is protecting the new volume
4. ✅ At least one successful backup of the new volume has completed

**Clean up old snapshots (if needed):**
```bash
# List old recovery points
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name starships-production-backups \
  --region ap-south-1

# Delete specific recovery point (only if needed)
# Note: AWS Backup handles retention automatically
```

### 4. Verify Backups Resume

**Create on-demand backup to verify:**
```bash
# Get new volume ID
NEW_VOLUME_ID=$(kubectl get pv -o jsonpath='{.items[?(@.spec.claimRef.name=="starships-data-starships-app-0")].spec.csi.volumeHandle}')

# Create test backup
aws backup start-backup-job \
  --backup-vault-name starships-production-backups \
  --resource-arn arn:aws:ec2:${AWS_REGION}:${AWS_ACCOUNT_ID}:volume/$NEW_VOLUME_ID \
  --iam-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/service-role/AWSBackupDefaultServiceRole \
  --region ap-south-1

# Check backup job status
aws backup list-backup-jobs \
  --region ap-south-1 \
  --by-resource-arn arn:aws:ec2:${AWS_REGION}:${AWS_ACCOUNT_ID}:volume/$NEW_VOLUME_ID \
  --max-results 5 \
  --output table
```

**Wait for next scheduled backup:**
```bash
# Scheduled backup runs at 04:00 IST daily
# Verify it completes successfully the next day

aws backup list-backup-jobs \
  --region ap-south-1 \
  --by-created-after $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --output table
```

---

## Cost Information

### Backup Costs (Monthly)

| Item | Cost Formula | Estimated Cost |
|------|--------------|----------------|
| EBS Snapshots (90 days) | $0.05/GB × 30GB × 90/30 | ~$4.50/month |
| AWS Backup Service | Free (charges only for snapshots) | $0 |
| **Total** | | **~$5/month** |

**Notes:**
- Snapshots are incremental (only changed blocks stored)
- First snapshot is full (30GB), subsequent snapshots only store changes
- Typical daily changes for database: 1-2GB
- Average monthly cost: $4-6 depending on data change rate

### Recovery Costs

- **Volume creation:** No charge (standard EBS pricing applies)
- **Data transfer:** No charge (within same region)
- **Snapshot restore:** No charge
- **Downtime cost:** ~15-20 minutes (application unavailable)

---

## Testing Recovery Process

### Quarterly DR Test

**Recommended schedule:** Every 3 months

**Test procedure:**

1. **Announce maintenance window** (30 minutes)

2. **Create test snapshot:**
   ```bash
   # Take on-demand backup before test
   aws backup start-backup-job \
     --backup-vault-name starships-production-backups \
     --resource-arn arn:aws:ec2:${AWS_REGION}:${AWS_ACCOUNT_ID}:volume/CURRENT_VOLUME_ID \
     --iam-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/service-role/AWSBackupDefaultServiceRole \
     --region ap-south-1
   ```

3. **Simulate disaster** (in staging/dev, NOT production):
   ```bash
   # Use dev cluster for testing
   kubectl config use-context your-user@starships-dev.ap-south-1.eksctl.io

   # Follow recovery procedure with dev cluster
   ```

4. **Document results:**
   - Actual recovery time
   - Issues encountered
   - Data integrity verification results

5. **Update procedures** based on lessons learned

---

## Emergency Contacts

### AWS Support

- **Support Plan:** Business/Enterprise
- **Case Priority:** Critical (production system down)
- **Phone:** Available in AWS Console under Support

### Team Contacts

- **Primary:** [Primary Contact Name] ([primary-contact@example.com])
- **Escalation:** [Escalation Contact Name] ([escalation-contact@example.com])

### Third-Party Services

- **PostgreSQL Expert Support:** [If applicable]
- **AWS Solutions Architect:** [If assigned]

---

## Compliance and Audit

### Retention Policy

- **Backup Retention:** 90 days
- **Reason:** Balance between recovery options and cost
- **Compliance:** [Add relevant compliance requirements]

### Audit Trail

All recovery operations are logged:
- AWS CloudTrail: All API calls
- Kubernetes audit logs: kubectl commands
- AWS Backup: Job history and recovery points

**Access logs:**
```bash
# View CloudTrail events for EBS volume
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=$VOLUME_ID \
  --region ap-south-1

# View Backup job history
aws backup list-backup-jobs \
  --region ap-south-1 \
  --by-resource-arn arn:aws:ec2:${AWS_REGION}:${AWS_ACCOUNT_ID}:volume/$VOLUME_ID
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-24 | DevOps Team | Initial version - tested and verified |
| 1.1 | 2025-10-24 | DevOps Team | Added Step 7: Update AWS Backup after recovery, emphasized tag-based selection |
| 1.2 | 2025-10-24 | DevOps Team | Security hardening: Removed hardcoded AWS account IDs, resource IDs, and availability zones; Added dynamic lookups, error handling, and credential security notes |
| 1.3 | 2025-10-25 | DevOps Team | Fixed backup selection to use custom tag `BackupPolicy=starships-postgres-production` for automatic protection after disaster recovery; Updated Step 4 and Step 7 to ensure restored volumes are automatically backed up |

---

## Appendix

### Quick Reference Commands

```bash
# Get current volume ID
kubectl get pv -o jsonpath='{.items[?(@.spec.claimRef.name=="starships-data-starships-app-0")].spec.csi.volumeHandle}'

# Get latest snapshot
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name starships-production-backups \
  --region ap-south-1 \
  --query 'RecoveryPoints[0].RecoveryPointArn' \
  --output text

# Check what AWS Backup is protecting
aws backup list-protected-resources --region ap-south-1 | grep volume

# Verify backup configuration
BACKUP_PLAN_ID=$(aws backup list-backup-plans --region ap-south-1 \
  --query 'BackupPlansList[?BackupPlanName==`starships-postgres-daily-backup`].BackupPlanId' \
  --output text)

aws backup get-backup-selection \
  --backup-plan-id $BACKUP_PLAN_ID \
  --selection-id $(aws backup list-backup-selections --backup-plan-id $BACKUP_PLAN_ID --region ap-south-1 --query 'BackupSelectionsList[0].SelectionId' --output text) \
  --region ap-south-1

# Check application status
kubectl get pods,pvc,pv -n starships-prod

# Test database connection
kubectl exec starships-app-0 -n starships-prod -- psql -U postgres -c "SELECT 1"
```

### Related Documentation

- [k8s/prod/03-deployment.yaml](../k8s/prod/03-deployment.yaml) - StatefulSet configuration
- [k8s/prod/01-storage-class.yaml](../k8s/prod/01-storage-class.yaml) - Storage class configuration
- [Dockerfile](../Dockerfile) - Application container configuration

### External Resources

- [AWS Backup Documentation](https://docs.aws.amazon.com/aws-backup/)
- [EBS Snapshots](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html)
- [Kubernetes StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [PostgreSQL Backup and Recovery](https://www.postgresql.org/docs/15/backup.html)
