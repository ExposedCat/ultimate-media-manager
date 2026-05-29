#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
	echo "Usage: deno task function:publish <function-app-name> [func publish options]" >&2
	exit 1
fi

function_app_name=$1
shift

bash "$(dirname "${BASH_SOURCE[0]}")/func.sh" \
	azure functionapp publish "${function_app_name}" --javascript --build remote "$@"
