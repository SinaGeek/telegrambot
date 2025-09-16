# Telegram Worker Bot

A simple Telegram bot that runs on Cloudflare Workers and responds with "your Bot is Online" when you send the `/start` command.

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
   wrangler login
   ```

3. Set your bot token as a secret:
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   ```
   Enter your bot token when prompted.

4. Deploy the worker:
   ```bash
   wrangler deploy
   ```

5. Copy the worker URL from the deployment output.

### 3. Set Webhook

Set your bot's webhook to point to your Cloudflare Worker:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-worker-name.your-subdomain.workers.dev"}'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and the URL with your worker's URL.

### 4. Test Your Bot

1. Find your bot on Telegram (search for the username you created)
2. Send `/start` command
3. You should receive "your Bot is Online" as a response

## Development

To run locally for development:

```bash
npm run dev
```

This will start a local development server where you can test your bot.

## Files

- `worker.js` - Main bot logic
- `wrangler.toml` - Cloudflare Workers configuration
- `package.json` - Node.js dependencies and scripts
