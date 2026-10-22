#!/bin/sh
set -eu
umask 077

state_dir="${WARP_STATE_DIR:-/var/lib/warp}"
mkdir -p "$state_dir"
cd "$state_dir"
rotate_minutes="${WARP_ROTATE_MINUTES:-0}"

roll() {
	next="$(mktemp -d ./next.XXXXXX)" || return 1
	if (
		cd "$next" &&
			wgcf register --accept-tos &&
			wgcf generate &&
			printf '\n[Socks5]\nBindAddress = 0.0.0.0:1080\n' >>wgcf-profile.conf
	); then
		mv "$next/wgcf-account.toml" "$next/wgcf-profile.conf" . || {
			rm -rf "$next"
			return 1
		}
		rm -rf "$next"
		return 0
	fi
	rm -rf "$next"
	return 1
}

if [ ! -s wgcf-account.toml ] || [ ! -s wgcf-profile.conf ]; then
	retry_seconds=10
	until roll; do
		echo "[WARP] Registration failed; retrying in ${retry_seconds}s" >&2
		sleep "$retry_seconds"
		retry_seconds="$((retry_seconds * 2))"
		[ "$retry_seconds" -le 60 ] || retry_seconds=60
	done
fi
if [ "$rotate_minutes" -le 0 ]; then
	exec wireproxy --config wgcf-profile.conf
fi

wireproxy --config wgcf-profile.conf &
proxy=$!
while sleep "$((rotate_minutes * 60))"; do
	if roll; then
		kill "$proxy" 2>/dev/null || true
		wait "$proxy" 2>/dev/null || true
		wireproxy --config wgcf-profile.conf &
		proxy=$!
	else
		echo "[WARP] Rotation failed; keeping the current proxy" >&2
	fi
done
