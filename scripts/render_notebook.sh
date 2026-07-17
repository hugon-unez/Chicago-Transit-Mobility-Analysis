#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$repo_dir/public/notebook"
cp "$repo_dir/notebook/chicago_transit_mobility.ipynb" \
  "$repo_dir/public/notebook/chicago_transit_mobility.ipynb"

echo "Synced the notebook used by the site's built-in reader."
