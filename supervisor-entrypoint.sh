#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

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

# Start supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf