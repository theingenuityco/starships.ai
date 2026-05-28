#!/usr/bin/env bash
# Periodic Postgres backup to S3 for a starship box. Run via cron, e.g.:
#   0 */6 * * * /opt/starships/backup.sh >> /var/log/starships-backup.log 2>&1
set -euo pipefail

: "${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET}"
STARSHIP_SLUG="${STARSHIP_SLUG:-starship}"
POSTGRES_DB="${POSTGRES_DATABASE:-starships}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
TS="$(date +%Y%m%d_%H%M%S)"
FILE="/tmp/${STARSHIP_SLUG}_${POSTGRES_DB}_${TS}.sql.gz"

# Dump from the running postgres container and compress.
docker compose -f /opt/starships/docker-compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${FILE}"

aws s3 cp "${FILE}" "s3://${BACKUP_S3_BUCKET}/${STARSHIP_SLUG}/${TS}.sql.gz"
rm -f "${FILE}"
echo "backup uploaded: s3://${BACKUP_S3_BUCKET}/${STARSHIP_SLUG}/${TS}.sql.gz"
