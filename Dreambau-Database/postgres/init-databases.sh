#!/bin/bash
set -e

# PostgreSQL Multi-Database Initialization Script
# This script creates databases and users for multiple applications

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PostgreSQL Multi-Database Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create NocoDB database and user
if [ ! -z "$NOCODB_DB_NAME" ] && [ ! -z "$NOCODB_DB_USER" ] && [ ! -z "$NOCODB_DB_PASSWORD" ]; then
    echo "→ Creating NocoDB database..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$NOCODB_DB_USER') THEN
                CREATE USER $NOCODB_DB_USER WITH PASSWORD '$NOCODB_DB_PASSWORD';
            END IF;
        END
        \$\$;

        -- Create database if not exists
        SELECT 'CREATE DATABASE $NOCODB_DB_NAME OWNER $NOCODB_DB_USER'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$NOCODB_DB_NAME')\gexec

        -- Grant privileges
        GRANT ALL PRIVILEGES ON DATABASE $NOCODB_DB_NAME TO $NOCODB_DB_USER;
        
        -- Connect to the database and set up schema permissions
        \c $NOCODB_DB_NAME
        GRANT ALL ON SCHEMA public TO $NOCODB_DB_USER;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $NOCODB_DB_USER;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $NOCODB_DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $NOCODB_DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $NOCODB_DB_USER;
EOSQL
    echo "✅ NocoDB database created: $NOCODB_DB_NAME (user: $NOCODB_DB_USER)"
fi

# Add more database creation blocks here as needed
# Template:
# if [ ! -z "$OTHERAPP_DB_NAME" ] && [ ! -z "$OTHERAPP_DB_USER" ] && [ ! -z "$OTHERAPP_DB_PASSWORD" ]; then
#     echo "→ Creating OtherApp database..."
#     psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
#         CREATE USER $OTHERAPP_DB_USER WITH PASSWORD '$OTHERAPP_DB_PASSWORD';
#         CREATE DATABASE $OTHERAPP_DB_NAME OWNER $OTHERAPP_DB_USER;
#         GRANT ALL PRIVILEGES ON DATABASE $OTHERAPP_DB_NAME TO $OTHERAPP_DB_USER;
# EOSQL
#     echo "✅ OtherApp database created"
# fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All databases initialized successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"



