#!/bin/sh
# Import workflow JSON files into the local n8n, publish them, restart n8n once.
# Usage: ./deploy.sh file1.json [file2.json ...]
# The CLI cannot run Data Table nodes, so tests go through the running server.
set -e
: "${N8N_CONTAINER:=one-page-n8n-1}"  # the n8n container, as in compose.yaml
cd "$(dirname "$0")"
for f in "$@"; do
  id=$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$f")
  docker cp "$f" "$N8N_CONTAINER":/tmp/"$(basename "$f")"
  docker exec "$N8N_CONTAINER" n8n import:workflow --input=/tmp/"$(basename "$f")" 2>&1 | grep -v "license SDK" | tail -1
  docker exec "$N8N_CONTAINER" n8n publish:workflow --id="$id" 2>&1 | grep -v "license SDK" | tail -1
done
cd ..
docker compose restart n8n >/dev/null 2>&1
curl -s -o /dev/null --retry 40 --retry-delay 2 --retry-all-errors --retry-connrefused http://127.0.0.1:5678/healthz
# Observed 2026-10-31: a request about 10 s after the restart still ran the previously published version;
# one about 80 s later ran the new one. Wait before testing, and check the version an execution used.
sleep 60
echo "n8n is back"
