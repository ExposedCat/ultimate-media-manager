# Ultimate Media Manager | Telegram Bot

See social media posts right in the Telegram Messenger.

<div align="center">

[![](https://img.shields.io/badge/Bot%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/UMMRobot)
[![](https://img.shields.io/badge/author%20blog%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/ExposedCatDev)
[![](https://img.shields.io/badge/author-Reddit-informational?style=for-the-badge&logo=reddit&logoColor=FF5700&color=FF5700)](https://www.reddit.com/user/ExposedCatDev)

</div>

# Features

- Media downloading
  - Instagram
  - TikTok
  - YouTube Shorts
  - Facebook
  - Reddit
  - Twitter (X)
  - Pinterest
  - Soundcloud
- Unified `/download` command for direct downloads

# Usage

## Media Downloading

### Group Chat

1. Add @UMMRobot to the group chat
2. Send any supported social media post link to the chat

### Any Chat

1. Type `@UMMRobot` in any chat and paste a supported social media post link
2. Press "Share post"

## Direct Downloading

1. Add @UMMRobot to the group chat
2. Use `/download link` or just `/download` **in reply** to the message
   containing a link
3. Or mention the bot in that reply to trigger the same download flow without the slash command

# Development

- Install Deno 2
- Install `yt-dlp` if you want the yt-dlp fallback outside the app container
- Install `ffmpeg` if you want collage generation outside the app container
- Start the bot with `deno task start`
- Run checks with `deno task check`
- Format with `deno task fmt`
- Run lint with `deno task lint`
- Run the full verification pass with `deno task verify`
- Run the existing migration with `deno task migrate:add-chat-settings`
- Runtime tasks load local variables from `.env` via Deno's `--env-file`

## Local development

Set `WARP_PROXY=socks5://127.0.0.1:1080` in `.env`, then `deno task dev:local` starts
the WARP sidecar and the bot together (and stops the sidecar on exit). Or run the
pieces yourself with `deno task warp` + `deno task dev`, or the full container setup
with `docker compose up`.

## Media resolution

- Resolved in-process by [postfetch](https://github.com/chelokot/postfetch) (zero-dependency, remuxes the DASH/HLS splits itself), with `yt-dlp` as the fallback
- Fetched through a **Cloudflare WARP** sidecar (`warp/`, a self-built userspace-WireGuard image — no privileges, no host tweaks), so the datacenter egress IP becomes a Cloudflare consumer IP — what gets YouTube past its datacenter-IP bot gate
- `WARP_PROXY` points the bot at the WARP SOCKS5 proxy; leave it empty to fetch directly (fine on a residential IP, gated on a datacenter one)
- WARP hands out a stable consumer IP (pinned to the nearest Cloudflare colo); the sidecar re-registers a fresh account every `WARP_ROTATE_MINUTES` (`compose.yml` default `30`, `0` disables) to roll the egress IP, and any container restart rolls it too
