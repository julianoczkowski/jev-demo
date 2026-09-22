#!/usr/bin/env bash
# One command: whisper-server + Next dev server. Ctrl-C stops both.
set -uo pipefail
cd "$(dirname "$0")/.."
bash scripts/whisper.sh &
W=$!
trap 'kill $W 2>/dev/null; pkill -f "whisper-server -m" 2>/dev/null; exit 0' INT TERM EXIT
pnpm exec next dev
