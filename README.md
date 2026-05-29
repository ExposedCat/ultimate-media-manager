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
- Set `COBALT_API_URL` to your hosted Cobalt API endpoint. For an Azure
  Function HTTP trigger, this is usually
  `https://<app>.azurewebsites.net/api/<route>`.
- Set `COBALT_API_KEY` if your Cobalt instance requires `Authorization: Api-Key`.
- Set `COBALT_AZURE_FUNCTION_KEY` if your Azure Function requires an
  `x-functions-key` header.
- Install `ffmpeg` if you want collage generation outside the app container
- Start the bot with `deno task start`
- Run checks with `deno task check`
- Format with `deno task fmt`
- Run lint with `deno task lint`
- Run the full verification pass with `deno task verify`
- Run the existing migration with `deno task migrate:add-chat-settings`
- Runtime tasks load local variables from `.env` via Deno's `--env-file`

## Local Cobalt Function Emulation

For local development, you can run a Cobalt container with Podman and point the
bot at it directly:

1. Set local Cobalt values in `.env`:
   - `COBALT_API_URL=http://127.0.0.1:9000`
   - `COBALT_AZURE_FUNCTION_KEY=`
2. Start everything with `deno task dev:local`

## Azure Cobalt Function

This repo includes an Azure Functions HTTP trigger at
`azure-functions/cobalt-proxy`. It exposes `POST /api/cobalt` and `GET /tunnel`,
boots Cobalt API inside the Function worker on cold start, and forwards requests
to that internal Cobalt server.

1. Install dependencies with `deno task function:install`
2. Configure your Function App settings:
   - `COBALT_INTERNAL_PORT=9000`
3. Publish to your existing Function App with
   `deno task function:publish <function-app-name>`
4. Set the bot env:
   - `COBALT_API_URL=https://<function-app-name>.azurewebsites.net/api/cobalt`
   - `COBALT_AZURE_FUNCTION_KEY=<function-specific-key>`
