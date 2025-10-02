#!/bin/sh
set -e

echo "Starting Starships.ai with supervisor..."

# Initialize PostgreSQL data directory if empty (when using volume mounts)
if [ -z "$POSTGRES_EXTERNAL_HOST" ]; then
    echo "Checking PostgreSQL data directory..."
    
    # Ensure PostgreSQL runtime directory exists with correct permissions
    mkdir -p /run/postgresql /var/log/postgresql
    chown -R postgres:postgres /run/postgresql /var/log/postgresql
    chmod 775 /run/postgresql
    
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
        
        # Run initialization scripts (standard PostgreSQL Docker pattern)
        if [ -d "/docker-entrypoint-initdb.d" ]; then
            echo "Running initialization scripts from /docker-entrypoint-initdb.d/..."
            
            # Start PostgreSQL temporarily for initialization
            su-exec postgres pg_ctl -D /var/lib/postgresql/data -w start
            
            # Wait for PostgreSQL to be ready
            for i in $(seq 1 30); do
                if su-exec postgres pg_isready -q; then
                    echo "PostgreSQL is ready for initialization"
                    break
                fi
                echo "Waiting for PostgreSQL to be ready... ($i/30)"
                sleep 1
            done
            
            # Export environment variables for init scripts
            export POSTGRES_DATABASE="${POSTGRES_DATABASE:-starships}"
            export POSTGRES_USER="${POSTGRES_USER:-postgres}"
            export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
            
            # Run all .sh and .sql scripts
            for f in /docker-entrypoint-initdb.d/*; do
                case "$f" in
                    *.sh)
                        if [ -x "$f" ]; then
                            echo "Running $f"
                            su-exec postgres sh -c "POSTGRES_DATABASE='$POSTGRES_DATABASE' POSTGRES_USER='$POSTGRES_USER' POSTGRES_PASSWORD='$POSTGRES_PASSWORD' $f"
                        fi
                        ;;
                    *.sql)
                        echo "Running $f"
                        su-exec postgres psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres < "$f"
                        ;;
                    *)
                        echo "Ignoring $f"
                        ;;
                esac
            done
            
            # Stop PostgreSQL
            su-exec postgres pg_ctl -D /var/lib/postgresql/data -w stop
        fi
        
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