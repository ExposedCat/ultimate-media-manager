#!/usr/bin/env bash
set -euo pipefail

pids=()

cleanup() {
	local exit_code=$?

	trap - EXIT INT TERM

	if ((${#pids[@]} > 0)); then
		echo
		echo "[dev:local] Stopping dev processes..."
		kill "${pids[@]}" 2>/dev/null || true
		wait "${pids[@]}" 2>/dev/null || true
	fi

	exit "$exit_code"
}

start() {
	local name=$1
	shift

	echo "[dev:local] Starting ${name}..."
	"$@" &
	pids+=("$!")
}

trap cleanup EXIT INT TERM

start "media function" deno task function:start
start "bot" deno task dev

wait -n "${pids[@]}"
