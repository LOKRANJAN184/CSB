#!/usr/bin/env bash
# ====================================================================
# Chendurar Sweets and Bakery - Startup Script
# ====================================================================

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$PROJECT_DIR/.tools/node/bin:$PROJECT_DIR/.tools/bin:$PATH"

echo "=========================================================="
echo " Starting Chendurar Sweets & Bakery Mobile App"
echo "=========================================================="

# 1. Ensure DB Directory exists
mkdir -p "$PROJECT_DIR/data/db"
mkdir -p "$PROJECT_DIR/uploads/bills"

# 2. Check if MongoDB is already running
if pgrep -f "mongod.*27017" > /dev/null; then
  echo "✓ MongoDB is already running on port 27017."
else
  echo "▶ Starting MongoDB..."
  "$PROJECT_DIR/.tools/bin/mongod" --dbpath "$PROJECT_DIR/data/db" --port 27017 --bind_ip 127.0.0.1 --fork --logpath "$PROJECT_DIR/data/mongod.log"
  echo "✓ MongoDB started."
fi

# 3. Start Backend Node.js Express server
echo "▶ Starting Backend Server on port 5000..."
cd "$PROJECT_DIR"
node server/server.js

