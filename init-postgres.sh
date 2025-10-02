#!/bin/sh
# PostgreSQL Initialization Script
# This script runs once during database initialization

set -e

# Get database configuration from environment
DB_NAME="${POSTGRES_DATABASE:-starships}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASS="${POSTGRES_PASSWORD:-password}"

echo "Initializing database '$DB_NAME' with user '$DB_USER'..."

# Connect to default postgres database and create our database
psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<-EOSQL
    -- Create database if it doesn't exist
    SELECT 'CREATE DATABASE ${DB_NAME}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
    
    -- Create user if it doesn't exist and set password
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '${DB_USER}') THEN
            CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
        END IF;
    END
    \$\$;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
    ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
EOSQL

echo "✓ Database '$DB_NAME' initialized successfully!"