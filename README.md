# Ultimate Media Manager | Telegram Bot

See social media posts right in the Telegram Messenger.

<div align="center">

[![](https://img.shields.io/badge/Bot%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/UMMRobot)
[![](https://img.shields.io/badge/author%20blog%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/ExposedCatDev)
[![](https://img.shields.io/badge/author-Reddit-informational?style=for-the-badge&logo=reddit&logoColor=FF5700&color=FF5700)](https://www.reddit.com/user/ExposedCatDev)

</div>

## Features

- Media downloading
  - Instagram
  - TikTok
  - YouTube Shorts
  - Facebook
  - LinkedIn
  - Reddit
  - Twitter (X)
  - Pinterest
  - SoundCloud
- Unified `/download` command for direct downloads

## Usage

### Media Downloading

1. Open a private chat with @UMMRobot or add it to a group chat
2. Send any supported social media post link to the chat

### Direct Downloading

1. Open a private chat with @UMMRobot or add it to a group chat
2. Use `/download link` or just `/download` **in reply** to the message
   containing a link
3. Or mention the bot in that reply to trigger the same download flow without the slash command

## Development

- Install Deno 2
- Copy `.env.example` to `.env` and configure the bot token, cache chat ID, and MongoDB connection
- Install `ffmpeg` for Postfetch MP4 normalization outside the app container
- Start the bot with `deno task start`
- Run checks with `deno task check`
- Format and apply lint fixes with `deno task format`
- Check formatting, lint, and types with `deno task verify`
- Run tests with `deno task test`
- Runtime tasks load local variables from `.env` via Deno's `--env-file`

### Local development

Set `WARP_PROXY=socks5://127.0.0.1:1080` in `.env`, then `deno task dev:local` starts
the WARP sidecar and the bot together (and stops the sidecar on exit). Or run the
pieces yourself with `deno task warp` + `deno task dev`, or the full container setup
with `docker compose up`.

### Media resolution

- Media is resolved in-process by [postfetch](https://github.com/chelokot/postfetch). Download failures are reported directly, so resolver issues can be diagnosed and fixed in Postfetch.
- Open `/settings` to change settings using rich-message buttons. Each setting has an **Enabled** button in green or a **Disabled** button in red beside its label; tap it to toggle and refresh the message in place. Settings apply to the current group or your private chat. Admin-only settings still require the bot admin.
- Photo/video slideshows with a soundtrack are sent as one video by default, with a minimum of one second per item. Actual time per item is the larger of the selected minimum and audio length divided by slide count, so the whole track plays. Shorter audio loops when needed. The slideshow status button turns conversion off or back on at a one-second minimum; the **1s–10s** button rows appear directly below the toggle only while conversion is enabled and select a minimum. Existing `/set_sld_on`, `/set_sld_off`, and `/set_sld_0`–`/set_sld_10` commands still work. Existing chats inherit the default automatically. Cached media is kept separately for each selected minimum.
- `WARP_PROXY` configures the Cloudflare WARP SOCKS5 proxy provided by the `warp/` sidecar. Leave it empty to fetch directly.
- `WARP_ROTATE_MINUTES` controls sidecar account rotation (`compose.yml` defaults to `30`; `0` disables rotation).

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
