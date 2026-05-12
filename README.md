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

1. Type `@UMMRobot` in any chat and paste the link to any supported social media
   post link (separated by space)
2. Press "Share post"

## Direct Downloading

1. Add @UMMRobot to the group chat
2. Use `/download link` or just `/download` **in reply** to the message
   containing a link

# Development

- Install Deno 2
- Install `yt-dlp` and `ffmpeg` if you want to use `/download` outside Docker
- Start the bot with `deno task start`
- Run checks with `deno task check`
- Format with `deno task fmt`
- Run lint with `deno task lint`
- Run the full verification pass with `deno task verify`
- Run the existing migration with `deno task migrate:add-chat-settings`
- Runtime tasks load local variables from `.env` via Deno's `--env-file`
