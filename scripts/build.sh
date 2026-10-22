#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sdk=

if [ "${SKIP_MACOS:-0}" != 1 ]; then
  sdk=${MACOS_SDK_PATH:-}
  if [ -z "$sdk" ] && [ "$(uname -s)" = Darwin ] && command -v xcrun >/dev/null 2>&1; then
    sdk=$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)
  fi
fi

set -- docker run --rm --platform linux/amd64 \
  --mount "type=bind,source=$root,target=/work" \
  -w /work \
  -e ZIG_GLOBAL_CACHE_DIR=/work/build/cache/zig-global \
  -e ZIG_LOCAL_CACHE_DIR=/work/build/cache/zig-local \
  -e npm_config_cache=/work/build/cache/npm

if [ -n "$sdk" ]; then
  if [ ! -d "$sdk" ]; then
    echo "macOS SDK not found: $sdk; skipping macOS target." >&2
  else
    sdk=$(CDPATH= cd -- "$sdk" && pwd -P)
    set -- "$@" -v "$sdk:/macos-sdk:ro"
  fi
fi

exec "$@" node:26.10.0-bookworm \
  sh -c '(test -x build/tools/zig/zig || python3 scripts/setup-tools.py) && npm run build:docker'
