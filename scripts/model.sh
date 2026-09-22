#!/usr/bin/env bash
# Download a whisper.cpp model: pnpm whisper:model base.en | small.en | medium.en | large-v3-turbo
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:-small.en}"
mkdir -p models
curl -L --progress-bar -o "models/ggml-$NAME.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$NAME.bin"
echo "saved models/ggml-$NAME.bin"
