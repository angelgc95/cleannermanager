#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required to run the local backend." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run the local backend." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    colima start
  else
    echo "Docker is installed but the daemon is not running. Start Docker or Colima and retry." >&2
    exit 1
  fi
fi

mkdir -p "$ROOT_DIR/supabase/snippets"

supabase start -x vector -x logflare --workdir "$ROOT_DIR"
"$ROOT_DIR/scripts/write-local-env.sh"
