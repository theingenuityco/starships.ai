#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

# Create supervisor config dynamically based on POSTGRES_EXTERNAL_HOST
if [ -n "$POSTGRES_EXTERNAL_HOST" ]; then
    echo "Configuring for external PostgreSQL..."
    cat > /etc/supervisor/conf.d/supervisord.conf << 'EOL'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:app]
command=/app/docker-entrypoint.sh
directory=/app
user=nodejs
environment=HOME="/home/nodejs",USER="nodejs"
autostart=true
autorestart=false
startsecs=30
startretries=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOL
else
    echo "Configuring for internal PostgreSQL..."
    cat > /etc/supervisor/conf.d/supervisord.conf << 'EOL'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:postgres]
command=su-exec postgres postgres -D /var/lib/postgresql/data
autostart=true
autorestart=true
user=root
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=1

[program:app]
command=/app/docker-entrypoint.sh
directory=/app
user=nodejs
environment=HOME="/home/nodejs",USER="nodejs"
autostart=true
autorestart=false
startsecs=30
startretries=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=2
EOL
fi

# Start supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf