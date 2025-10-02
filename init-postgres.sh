#!/bin/sh
# PostgreSQL Initialization Script
# This script runs once during database initialization

set -e

# Get database configuration from environment
DB_NAME="${POSTGRES_DATABASE:-starships}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASS="${POSTGRES_PASSWORD:-password}"

echo "Creating database '$DB_NAME'..."

# Create the database using psql
psql -v ON_ERROR_STOP=1 --username "$DB_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $DB_NAME'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
    
    \c $DB_NAME
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOSQL

echo "Database '$DB_NAME' initialized successfully!"