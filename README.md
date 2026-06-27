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
- Set `MEDIA_API_URL` to your media function endpoint — an Azure Function HTTP
  trigger at `https://<app>.azurewebsites.net/api/media`.
- Set `MEDIA_AZURE_FUNCTION_KEY` if your Azure Function requires an
  `x-functions-key` header.
- Install `ffmpeg` if you want collage generation outside the app container
- Start the bot with `deno task start`
- Run checks with `deno task check`
- Format with `deno task fmt`
- Run lint with `deno task lint`
- Run the full verification pass with `deno task verify`
- Run the existing migration with `deno task migrate:add-chat-settings`
- Runtime tasks load local variables from `.env` via Deno's `--env-file`

## Local development

The media function runs locally with the Azure Functions Core Tools. Install its
dependencies once with `deno task function:install`, then start the function and
the bot together with `deno task dev:local` — the function serves
`http://localhost:7071/api/media`.

Point the bot at the local function in `.env`:

- `MEDIA_API_URL=http://localhost:7071/api/media`
- `MEDIA_AZURE_FUNCTION_KEY=`

## Azure Media Function

This repo includes an Azure Functions HTTP trigger at
`azure-functions/media-function`. It exposes `POST /api/media`, resolves posts
with [postfetch](https://github.com/chelokot/postfetch), and falls back to yt-dlp
inside the Function worker on demand.

1. Install dependencies with `deno task function:install`
2. Configure your Function App settings:
   - `YTDLP_TIMEOUT_MS=120000`
   - `YTDLP_PLAYLIST_LIMIT=50`
   - Optional: `YOUTUBE_DL_PATH` or `YT_DLP_PATH` to use a specific yt-dlp binary
3. Publish to your existing Function App with
   `deno task function:publish <function-app-name>`
4. Set the bot env:
   - `MEDIA_API_URL=https://<function-app-name>.azurewebsites.net/api/media`
   - `MEDIA_AZURE_FUNCTION_KEY=<function-specific-key>`
