#!/usr/bin/env bash
# Run the bot's integration tests against a sibling Postfetch checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
postfetch_root="${1:-../../Misc/postfetch}"
postfetch_entry="$(realpath "$postfetch_root/packages/core/src/index.ts")"
test_config_dir="$(mktemp -d)"
trap 'rm -rf "$test_config_dir"' EXIT
# A temporary config preserves Deno's npm subpath resolution and leaves the
# production dependency and lockfile untouched while testing unreleased changes.
deno eval 'const config = JSON.parse(await Deno.readTextFile("deno.json")); config.imports["@postfetch/core"] = new URL(`file://${Deno.args[0]}`).href; config.lock = Deno.args[1] + "/deno.lock"; await Deno.writeTextFile(Deno.args[1] + "/deno.json", JSON.stringify(config)); await Deno.copyFile("deno.lock", config.lock);' "$postfetch_entry" "$test_config_dir"
TOKEN=123:test DB_CONNECTION_STRING=mongodb://127.0.0.1:27017 CACHE_CHAT_ID=0 \
  deno test -A --unstable-sloppy-imports --config="$test_config_dir/deno.json" --frozen=false test/
