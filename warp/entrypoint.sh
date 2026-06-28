#!/bin/sh
set -e

cd /tmp
wgcf register --accept-tos
wgcf generate
printf '\n[Socks5]\nBindAddress = 0.0.0.0:1080\n' >>wgcf-profile.conf

exec wireproxy --config wgcf-profile.conf
