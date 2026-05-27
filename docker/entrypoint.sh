#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/api
npx prisma migrate deploy

echo "Starting API..."
cd /app
exec node api/dist/main.js
