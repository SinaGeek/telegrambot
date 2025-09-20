# Telegram → Google Drive Bot (Cloudflare Workers)

Manage Google Drive right from Telegram:

- Upload by sending files to the bot
- List files with IDs
- Rename files
- Remove files
- Connect your Drive via Google OAuth 2.0 (offline access)

## Prerequisites

- Telegram bot token (create via [@BotFather](https://t.me/botfather))
- Cloudflare account + a Worker (custom domain optional)
- Google Cloud project with OAuth consent screen configured
- Node.js and Wrangler CLI

## Setup

### 1) Telegram Bot

1. Message [@BotFather](https://t.me/botfather)
2. `/newbot` → follow prompts
3. Save the bot token

### 2) Cloudflare Worker

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   ```
2. Login:
   ```bash
   npx wrangler login
   ```
3. Set secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
4. Create D1 (used to store refresh tokens):
   ```bash
   npx wrangler d1 create user-tokens
   ```
   Add the binding to `wrangler.toml`:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "USER_TOKENS"
   database_id = "<your-database-id>"
   ```
   The worker will auto-create the `user_tokens` table on first login. If you prefer manual creation:
   ```bash
   npx wrangler d1 execute USER_TOKENS --command="CREATE TABLE IF NOT EXISTS user_tokens (user_id TEXT PRIMARY KEY, refresh_token TEXT NOT NULL);"
   ```
5. Deploy:
   ```bash
   npx wrangler deploy
   ```

### 3) Google OAuth 2.0

Create an OAuth Client (type: Web application) under Google Cloud → APIs & Services → Credentials.

- Authorized domains: add your site domain (e.g., `example.com`)
- Authorized redirect URIs (case/scheme must match exactly):
  - Production: `https://<YOUR_HOST>/googlesignin.html`
  - Local dev (Wrangler default):
    - `http://127.0.0.1:8787/googlesignin.html`
    - `http://localhost:8787/googlesignin.html`
  - If using a different dev port (e.g., 8788), add that as well.

Ensure your consent screen is configured and published (Testing/Production). Scope used: `https://www.googleapis.com/auth/drive.file`.

### 4) Telegram Webhook

Set the webhook to your Worker URL (the bot listens on `/bot`).

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<YOUR_HOST>/bot"}'
```

Replace `<YOUR_HOST>` with your Worker hostname (custom domain or `*.workers.dev`).

## Usage

In Telegram chat with your bot:

- /start — check bot status
- /help — show help and buttons
- /login — get Google sign-in link
- Send a file — uploads to Drive
- /list — recent Drive files
- /rename <fileId> <newName> — rename file
- /remove <fileId> — delete file
- /privacy — links to Privacy Policy and Terms

After login success, the web page redirects users back to the bot, e.g.: `https://t.me/<YOUR_BOT_USERNAME>?start=auth_done`.

## Development

Run locally:

```bash
npm run dev
```

Default dev URLs: `http://127.0.0.1:8787` and `http://localhost:8787`.

## Pages

- `Index.html` — homepage
- `policy.html` — Privacy Policy (served at `/policy`)
- `terms.html` — Terms of Service (served at `/terms`)
- `googlesignIn.html` — OAuth redirect landing page (served at `/googlesignin.html`)

## Troubleshooting

- OAuth `redirect_uri_mismatch`: add the exact redirect URI(s) shown above to your OAuth client.
- Telegram HTML error (e.g., unsupported tags): keep `/help` HTML simple; use newlines (\n).
- Webhook 404: ensure webhook URL uses `/bot` and deployment is up.
- Proxy/VPN issues with Wrangler: unset proxy env vars and set `NO_PROXY` for Cloudflare domains, then retry with `--verbose`.
