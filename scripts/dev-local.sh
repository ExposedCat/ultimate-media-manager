#!/usr/bin/env bash
set -euo pipefail

cleanup() {
	docker rm -f umm-warp >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "[dev:local] Starting WARP sidecar..."
docker rm -f umm-warp >/dev/null 2>&1 || true
deno task warp >/dev/null

echo "[dev:local] Starting bot..."
deno task dev
