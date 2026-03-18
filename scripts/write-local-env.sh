#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS_OUTPUT="$(supabase status -o env --workdir "$ROOT_DIR")"
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$ROOT_DIR/supabase/config.toml" | head -n 1)"

get_env_var() {
  local name="$1"
  printf '%s\n' "$STATUS_OUTPUT" | sed -n "s/^${name}=\"\\(.*\\)\"$/\\1/p" | head -n 1
}

SUPABASE_URL="$(get_env_var API_URL)"
SUPABASE_PUBLISHABLE_KEY="$(get_env_var PUBLISHABLE_KEY)"

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_PUBLISHABLE_KEY" ]]; then
  echo "Could not read local Supabase credentials. Start the backend first with 'npm run local:backend'." >&2
  exit 1
fi

cat > "$ROOT_DIR/.env.local" <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=$PROJECT_ID
EOF

echo "Wrote $ROOT_DIR/.env.local"
