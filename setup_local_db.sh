#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MYSQL_ARGS=()
if mysql -e "SELECT 1" >/dev/null 2>&1; then
  MYSQL_ARGS=()
elif [ -r /etc/mysql/debian.cnf ] && mysql --defaults-file=/etc/mysql/debian.cnf -e "SELECT 1" >/dev/null 2>&1; then
  MYSQL_ARGS=(--defaults-file=/etc/mysql/debian.cnf)
else
  read -r -s -p "Enter MySQL root password: " MYSQL_PWD_INPUT
  echo ""
  export MYSQL_PWD="$MYSQL_PWD_INPUT"
  MYSQL_ARGS=(-u root)
fi

echo "Creating database 'property_lead_manager' and local user 'plm_user'..."
mysql "${MYSQL_ARGS[@]}" -e "
CREATE DATABASE IF NOT EXISTS property_lead_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'plm_user'@'127.0.0.1' IDENTIFIED BY 'LocalPlmPass123!';
GRANT ALL PRIVILEGES ON property_lead_manager.* TO 'plm_user'@'127.0.0.1';
FLUSH PRIVILEGES;
"

echo "Importing schema.sql..."
mysql "${MYSQL_ARGS[@]}" property_lead_manager < "$SCRIPT_DIR/backend/database/schema.sql"

echo "Tables created:"
mysql "${MYSQL_ARGS[@]}" -e "SHOW TABLES FROM property_lead_manager;"

unset MYSQL_PWD || true

echo "Done! Checking PHP API health..."
curl -s http://127.0.0.1:8000/api/health || true
echo ""
