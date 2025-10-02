#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

# Initialize PostgreSQL data directory if empty (when using volume mounts)
if [ -z "$POSTGRES_EXTERNAL_HOST" ]; then
    echo "Checking PostgreSQL data directory..."
    
    # Check if data directory is empty or uninitialized
    if [ ! -f "/var/lib/postgresql/data/postgresql.conf" ]; then
        echo "PostgreSQL data directory is not initialized. Initializing now..."
        
        # Ensure correct ownership
        chown -R postgres:postgres /var/lib/postgresql
        chmod 700 /var/lib/postgresql/data
        
        # Initialize PostgreSQL cluster as postgres user
        su-exec postgres initdb -D /var/lib/postgresql/data
        
        # Configure PostgreSQL
        echo "listen_addresses = '*'" >> /var/lib/postgresql/data/postgresql.conf
        echo "port = 5432" >> /var/lib/postgresql/data/postgresql.conf
        echo "max_connections = 100" >> /var/lib/postgresql/data/postgresql.conf
        echo "shared_buffers = 128MB" >> /var/lib/postgresql/data/postgresql.conf
        echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/data/pg_hba.conf
        echo "local all all trust" >> /var/lib/postgresql/data/pg_hba.conf
        
        echo "PostgreSQL initialization complete!"
    else
        echo "PostgreSQL data directory already initialized."
    fi
fi

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