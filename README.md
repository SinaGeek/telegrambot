# WOWDrive — Telegram Google Drive Bot (Cloudflare Workers)

Manage your Google Drive directly from Telegram:

- Upload by sending files to the bot
- List files with IDs
- Rename files
- Remove files
- Connect your Drive securely via Google Sign-In

## Setup Instructions

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Save the bot token you receive

### 2. Deploy to Cloudflare Workers

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Set your bot token as a secret:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   ```
   Enter your bot token when prompted.

4. Set your Google Client Secret as a secret:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   Paste your Google Client Secret when prompted.

5. Set your Google Client ID as a secret:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID 
   ```
   Paste your Google Client ID when prompted.

6. Create your user token database (Cloudflare D1):
   ```bash
   npx wrangler d1 create user-tokens 
   ```
   Note the returned database_id. Add the binding to wrangler.toml:

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "user-tokens"
   database_id = "<your-database-id>"
   ```

7. Create the table on D1:
   ```bash
   npx wrangler d1 execute user-tokens --command="CREATE TABLE user_tokens (user_id TEXT PRIMARY KEY, refresh_token TEXT NOT NULL);"
   ```
   Enter your bot token when prompted.

8. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

9. Copy the worker URL from the deployment output (e.g., https://bot.turksafar.ir).

### 3. Set Webhook

Set your bot's webhook to point to your Cloudflare Worker:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://bot.turksafar.ir/bot"}'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and the URL with your worker's URL.

### 4. Test Your Bot

1. Find your bot on Telegram (search for the username you created)
2. Send `/start` command
3. You should receive "your Bot is Online" as a response
4. Send `/login` to get the Google sign-in link
5. Send a document/photo to upload it to Drive
6. Use `/list`, `/rename <fileId> <newName>`, `/remove <fileId>`

## Development

To run locally for development:

```bash
npm run dev
```

This will start a local development server where you can test your bot.

## Files

- `src/worker.js` — Routes requests (`GET` site, `POST` bot, `/login` if implemented)
- `src/bot.js` — Telegram bot logic and commands
- `src/site.js` — Serves static pages
- `src/GoogleSignIn.html` — Google sign-in page
- `wrangler.toml` — Cloudflare Workers configuration
- `package.json` — Node.js dependencies and scripts
