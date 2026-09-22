#!/usr/bin/env bash
# Starts the local whisper.cpp HTTP server (Homebrew `whisper-cpp`).
# Model files live in ./models. Override with WHISPER_MODEL=models/ggml-base.en.bin
set -euo pipefail
cd "$(dirname "$0")/.."
MODEL="${WHISPER_MODEL:-models/ggml-small.en.bin}"
PORT="${WHISPER_PORT:-8178}"
if [ ! -f "$MODEL" ]; then
  echo "Model $MODEL not found. Run: pnpm whisper:model small.en" >&2
  exit 1
fi
echo "whisper-server → http://127.0.0.1:$PORT  (model: $MODEL)"
exec whisper-server -m "$MODEL" --host 127.0.0.1 --port "$PORT" -t 6 -nt -sns -l en --no-language-probabilities 2>&1 \
  | grep -vE "^(ggml_|load_backend|whisper_|gguf|system_info)" || true
