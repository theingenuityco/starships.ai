#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

# Create supervisor config dynamically based on NEO4J_EXTERNAL_URI
if [ -n "$NEO4J_EXTERNAL_URI" ]; then
    echo "Configuring for external Neo4j..."
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
    echo "Configuring for internal Neo4j..."
    cat > /etc/supervisor/conf.d/supervisord.conf << 'EOL'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:neo4j]
command=/opt/neo4j/bin/neo4j console
autostart=true
autorestart=true
user=nodejs
environment=HOME="/home/nodejs",USER="nodejs"
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