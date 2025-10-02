#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

# Ensure PGDATA is set consistently
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"

# Initialize PostgreSQL data directory if empty (when using volume mounts)
if [ -z "$POSTGRES_EXTERNAL_HOST" ]; then
    echo "Checking PostgreSQL data directory..."
    
    # Ensure PostgreSQL runtime directory exists with correct permissions
    mkdir -p /run/postgresql /var/log/postgresql
    chown -R postgres:postgres /run/postgresql /var/log/postgresql
    chmod 775 /run/postgresql
    
    # Check if data directory is empty or uninitialized
    if [ ! -f "$PGDATA/postgresql.conf" ]; then
        echo "PostgreSQL data directory is not initialized. Initializing now..."
        
        # Ensure correct ownership
        chown -R postgres:postgres /var/lib/postgresql
        mkdir -p "$PGDATA"
        chmod 700 "$PGDATA"
        
        # Initialize PostgreSQL cluster as postgres user
        su-exec postgres initdb -D "$PGDATA"
        
        # Configure PostgreSQL
        echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"
        echo "port = 5432" >> "$PGDATA/postgresql.conf"
        echo "max_connections = 100" >> "$PGDATA/postgresql.conf"
        echo "shared_buffers = 128MB" >> "$PGDATA/postgresql.conf"
        echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
        echo "local all all trust" >> "$PGDATA/pg_hba.conf"
        
        echo "PostgreSQL initialization complete!"
    else
        echo "PostgreSQL data directory already initialized."
    fi
    
    # Always check and create database if it doesn't exist (even on restart)
    # This handles cases where volume was partially initialized
    echo "Ensuring database exists..."
    
    # Start PostgreSQL temporarily to check/create database
    su-exec postgres pg_ctl -D "$PGDATA" -w start
    
    # Wait for PostgreSQL to be ready
    for i in $(seq 1 30); do
        if su-exec postgres pg_isready -q; then
            echo "PostgreSQL is ready"
            break
        fi
        echo "Waiting for PostgreSQL to be ready... ($i/30)"
        sleep 1
    done
    
    # Export environment variables
    export POSTGRES_DATABASE="${POSTGRES_DATABASE:-starships}"
    export POSTGRES_USER="${POSTGRES_USER:-postgres}"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
    
    # Check if database exists, create if not
    DB_EXISTS=$(su-exec postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DATABASE'")
    
    if [ "$DB_EXISTS" != "1" ]; then
        echo "Database '$POSTGRES_DATABASE' does not exist. Creating..."
        su-exec postgres psql -U postgres -c "CREATE DATABASE $POSTGRES_DATABASE;"
        su-exec postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DATABASE TO $POSTGRES_USER;"
        su-exec postgres psql -U postgres -c "ALTER DATABASE $POSTGRES_DATABASE OWNER TO $POSTGRES_USER;"
        echo "✓ Database '$POSTGRES_DATABASE' created successfully!"
    else
        echo "✓ Database '$POSTGRES_DATABASE' already exists"
    fi
    
    # Stop PostgreSQL
    su-exec postgres pg_ctl -D "$PGDATA" -w stop
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
    cat > /etc/supervisor/conf.d/supervisord.conf << EOL
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:postgres]
command=su-exec postgres postgres -D ${PGDATA}
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