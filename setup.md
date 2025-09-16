# Setup Instructions for Telegram Bot on Cloudflare Workers

## 1. Set up your bot token securely

Instead of putting your bot token in the wrangler.toml file (which is not secure), use Cloudflare Workers secrets:

```bash
# Set your bot token as a secret
wrangler secret put TELEGRAM_BOT_TOKEN
```

When prompted, enter your bot token: `7863758983:AAGb05uwffCmuBBxRVI5Tj8bf-8-ajSSN0w`

## 2. Create KV namespace for assets

```bash
# Create KV namespace for assets
wrangler kv:namespace create "ASSETS"
wrangler kv:namespace create "ASSETS" --preview
```

Copy the namespace IDs from the output and update your `wrangler.toml` file:
- Replace `your-kv-namespace-id` with the production namespace ID
- Replace `your-preview-kv-namespace-id` with the preview namespace ID

## 3. Install dependencies

```bash
npm install
```

## 4. Deploy your worker

```bash
wrangler deploy
```

## 5. Set up Telegram webhook

After deployment, set your bot's webhook to point to your Cloudflare Worker:

```bash
curl -X POST "https://api.telegram.org/bot7863758983:AAGb05uwffCmuBBxRVI5Tj8bf-8-ajSSN0w/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://bot.turksafar.ir"}'
```

## 6. Test your bot

1. Visit `https://bot.turksafar.ir` - should show the main page
2. Visit `https://bot.turksafar.ir/policy` - should show the privacy policy
3. Visit `https://bot.turksafar.ir/terms` - should show the terms of service
4. Send `/start` to your bot on Telegram - should respond with "your Bot is Online"

## Features

✅ **Telegram Bot**: Responds to `/start` command with "your Bot is Online"
✅ **Static File Serving**: Serves HTML files from the `src/` folder
✅ **Policy Page**: Accessible at `/policy` or `/policy.html`
✅ **Terms Page**: Accessible at `/terms` or `/terms.html`
✅ **Main Page**: Serves `Index.html` for the root path
✅ **Secure**: Bot token stored as a secret, not in code

thanks
