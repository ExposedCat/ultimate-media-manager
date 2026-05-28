#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_func="${project_dir}/node_modules/.bin/func"
local_bin_dir="${project_dir}/node_modules/azure-functions-core-tools/bin"
local_bin_func="${local_bin_dir}/func"
zip_file="$(find "${local_bin_dir}" -maxdepth 1 -name 'Azure.Functions.Cli.*.zip' -print -quit 2>/dev/null || true)"

if [[ -x "${local_func}" && ! -x "${local_bin_func}" ]]; then
	if [[ -z "${zip_file}" ]]; then
		echo "[func] Azure Functions Core Tools is not installed. Run deno task function:install first." >&2
		exit 1
	fi

	unzip -q -o "${zip_file}" -d "${local_bin_dir}"
	chmod +x "${local_bin_func}"
fi

if [[ -x "${local_func}" ]]; then
	exec "${local_func}" "$@"
fi

system_func="$(PATH="$(echo "${PATH}" | tr ':' '\n' | grep -v "${project_dir}/node_modules/.bin" | paste -sd ':' -)" command -v func || true)"
if [[ -n "${system_func}" ]]; then
	exec "${system_func}" "$@"
fi

echo "[func] Azure Functions Core Tools is not installed. Run deno task function:install first." >&2
exit 1
