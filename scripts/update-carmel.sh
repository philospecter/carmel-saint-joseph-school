#!/bin/bash
cd ~/Projects/carmel-saint-joseph-school

echo "📥 Pulling latest code..."
BEFORE=$(git rev-parse HEAD)
git pull
AFTER=$(git rev-parse HEAD)

echo "🔍 Checking for new migrations..."
NEW=$(git diff "$BEFORE" "$AFTER" --name-only -- supabase/migrations/)

if [ -n "$NEW" ]; then
  echo "⚠️  New migrations found:"
  echo "$NEW"
  echo ""
  echo "🚀 Pushing to Supabase..."
  npx supabase db push --db-url "postgresql://postgres.mrwrzqyofjpnoejzylda:YCLJf1jtU3lkVZnB@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
else
  echo "✅ No new migrations. Database is up to date!"
fi
