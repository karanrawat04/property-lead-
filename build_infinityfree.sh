#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/frontend/dist/frontend/browser"
OUT_DIR="$ROOT_DIR/deploy-htdocs"
SKIP_NG_BUILD=0

if [[ "${1:-}" == "--skip-ng-build" ]]; then
  SKIP_NG_BUILD=1
fi

if [[ "$SKIP_NG_BUILD" -eq 0 ]]; then
  echo "1. Building Angular production bundle..."
  cd "$ROOT_DIR/frontend"
  npx ng build
fi

echo "2. Preparing InfinityFree htdocs bundle at $OUT_DIR..."
LOCAL_CFG_BACKUP=""
if [[ -f "$OUT_DIR/config/config.local.php" ]]; then
  LOCAL_CFG_BACKUP="$(mktemp)"
  cp "$OUT_DIR/config/config.local.php" "$LOCAL_CFG_BACKUP"
fi

UPLOADS_BACKUP=""
if [[ -d "$OUT_DIR/uploads" ]]; then
  UPLOADS_BACKUP="$(mktemp -d)"
  cp -r "$OUT_DIR/uploads"/* "$UPLOADS_BACKUP/" 2>/dev/null || true
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp -r "$DIST_DIR"/* "$OUT_DIR/"
cp "$ROOT_DIR/backend/htdocs.htaccess" "$OUT_DIR/.htaccess"

mkdir -p "$OUT_DIR/api" "$OUT_DIR/config" "$OUT_DIR/lib" "$OUT_DIR/database" "$OUT_DIR/uploads/avatars"
if [[ -n "$UPLOADS_BACKUP" && -d "$UPLOADS_BACKUP" ]]; then
  cp -r "$UPLOADS_BACKUP"/* "$OUT_DIR/uploads/" 2>/dev/null || true
  rm -rf "$UPLOADS_BACKUP"
fi
cp "$ROOT_DIR/backend/api/index.php" "$OUT_DIR/api/index.php"
cp "$ROOT_DIR/backend/api/.htaccess" "$OUT_DIR/api/.htaccess"
cp "$ROOT_DIR/backend/config/config.php" "$OUT_DIR/config/config.php"
cp "$ROOT_DIR/backend/config/config.example.php" "$OUT_DIR/config/config.example.php"
if [[ -n "$LOCAL_CFG_BACKUP" ]]; then
  mv "$LOCAL_CFG_BACKUP" "$OUT_DIR/config/config.local.php"
fi
cp -r "$ROOT_DIR/backend/lib/"* "$OUT_DIR/lib/"
cp "$ROOT_DIR/backend/database/schema.sql" "$OUT_DIR/database/schema.sql"

# Protect config/, lib/, and database/ from direct HTTP access
cat << 'EOF' > "$OUT_DIR/config/.htaccess"
Deny from all
EOF
cat << 'EOF' > "$OUT_DIR/lib/.htaccess"
Deny from all
EOF
cat << 'EOF' > "$OUT_DIR/database/.htaccess"
Deny from all
EOF

echo "Done! deploy-htdocs/ is synced with the latest Angular + PHP build."
