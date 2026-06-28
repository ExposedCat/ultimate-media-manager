#!/bin/sh
set -eu

cd /tmp
rotate_minutes="${WARP_ROTATE_MINUTES:-0}"

roll() {
	rm -f wgcf-account.toml wgcf-profile.conf
	wgcf register --accept-tos
	wgcf generate
	printf '\n[Socks5]\nBindAddress = 0.0.0.0:1080\n' >>wgcf-profile.conf
}

if [ "$rotate_minutes" -le 0 ]; then
	roll
	exec wireproxy --config wgcf-profile.conf
fi

while true; do
	roll
	wireproxy --config wgcf-profile.conf &
	proxy=$!
	sleep "$((rotate_minutes * 60))"
	kill "$proxy" 2>/dev/null || true
	wait "$proxy" 2>/dev/null || true
done
