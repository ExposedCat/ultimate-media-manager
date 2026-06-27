#!/usr/bin/env bash
set -euo pipefail

function_app_name="${1:-ummr-us}"
if [[ $# -gt 0 ]]; then
	shift
fi

bash "$(dirname "${BASH_SOURCE[0]}")/func.sh" \
	azure functionapp publish "${function_app_name}" --javascript --build remote "$@"
