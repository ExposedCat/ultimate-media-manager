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

roll
if [ "$rotate_minutes" -le 0 ]; then
	exec wireproxy --config wgcf-profile.conf
fi

wireproxy --config wgcf-profile.conf &
proxy=$!
while sleep "$((rotate_minutes * 60))"; do
	roll
	kill "$proxy" 2>/dev/null || true
	wait "$proxy" 2>/dev/null || true
	wireproxy --config wgcf-profile.conf &
	proxy=$!
done
