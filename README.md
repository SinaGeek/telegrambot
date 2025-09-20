# Telegram → Google Drive Bot (Cloudflare Workers)

A powerful Telegram bot that seamlessly uploads files to Google Drive with advanced features:

- 📤 **Smart File Upload**: Upload documents, photos, and videos directly to Google Drive
- 🔄 **Resumable Uploads**: Large files are handled with chunked upload and progress tracking
- 📊 **Real-time Progress**: Live progress updates during uploads with speed and ETA
- 🔐 **Secure OAuth**: Google OAuth 2.0 integration with offline access
- 📁 **File Management**: List, rename, and delete files from your Drive
- ⚡ **High Performance**: Built on Cloudflare Workers for global edge deployment
- 🛡️ **Error Handling**: Comprehensive error reporting with detailed debugging information

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
4. Create D1 database (used to store user tokens and upload tracking):
   ```bash
   npx wrangler d1 create telegram-drive-bot
   ```
   Add the binding to `wrangler.toml`:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "telegram-drive-bot"
   database_id = "<your-database-id>"
   ```
   
   Create the required tables:
   ```bash
   # User tokens table
   npx wrangler d1 execute telegram-drive-bot --command="CREATE TABLE IF NOT EXISTS USER_TOKENS (
     user_id TEXT PRIMARY KEY,
     refresh_token TEXT NOT NULL,
     access_token TEXT,
     expires_at INTEGER,
     created_at INTEGER DEFAULT (strftime('%s', 'now')),
     updated_at INTEGER DEFAULT (strftime('%s', 'now'))
   );"
   
   # Uploads tracking table
   npx wrangler d1 execute telegram-drive-bot --command="CREATE TABLE IF NOT EXISTS UPLOADS (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     chat_id INTEGER NOT NULL,
     message_id INTEGER,
     file_name TEXT NOT NULL,
     total INTEGER NOT NULL,
     uploaded INTEGER DEFAULT 0,
     status TEXT DEFAULT 'queued',
     started_at INTEGER DEFAULT (strftime('%s', 'now')),
     updated_at INTEGER DEFAULT (strftime('%s', 'now')),
     cancel INTEGER DEFAULT 0,
     file_id TEXT NOT NULL,
     is_large_file INTEGER DEFAULT 0
   );"
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

### Basic Commands
- `/start` — check bot status
- `/help` — show help and buttons with quick actions
- `/login` — get Google sign-in link
- `/privacy` — links to Privacy Policy and Terms

### File Management
- **Send any file** — uploads to Google Drive with progress tracking
- `/list` — list recent Drive files with IDs
- `/rename <fileId> <newName>` — rename a file
- `/remove <fileId>` — delete a file
- `/stat` — show your Drive storage usage and account info

### File Upload Features
- **Small Files (≤20MB)**: Direct upload with instant processing
- **Large Files (>20MB)**: Chunked upload with real-time progress updates
- **Progress Tracking**: Live progress bars, speed, and ETA during uploads
- **Upload Controls**: Cancel uploads or view progress at any time
- **Error Handling**: Detailed error messages with debugging information

### Supported File Types
- Documents (PDF, DOC, XLS, etc.)
- Images (JPG, PNG, GIF, etc.)
- Videos (MP4, AVI, MOV, etc.)
- Archives (ZIP, RAR, 7Z, etc.)
- Any file type supported by Google Drive

**Note**: Files larger than 20MB are subject to Telegram's bot API limitations and may not be processable through the bot.

After login success, the web page redirects users back to the bot, e.g.: `https://t.me/<YOUR_BOT_USERNAME>?start=auth_done`.

## Recent Updates & Features

### Enhanced Error Handling
- **Detailed Error Messages**: Comprehensive error reporting with HTTP status codes, API error codes, and descriptions
- **Debug Information**: File details, timestamps, and context for easier troubleshooting
- **User-Friendly Messages**: Clear explanations without technical jargon

### Improved File Processing
- **Smart File Detection**: Automatic detection of file types and sizes
- **Resumable Downloads**: Efficient handling of large files with streaming
- **Progress Tracking**: Real-time upload progress with speed and ETA calculations
- **Upload Controls**: Cancel uploads or view progress at any time

### Performance Optimizations
- **Code Efficiency**: Reduced duplicate code and optimized API calls
- **Memory Management**: Efficient chunked processing for large files
- **Error Recovery**: Graceful fallback mechanisms for API failures

### Database Improvements
- **Enhanced Schema**: Updated database structure for better tracking and performance
- **Upload Tracking**: Comprehensive upload status and progress monitoring
- **Token Management**: Improved OAuth token handling and refresh logic

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

## Database Schema

The bot uses two main tables in the D1 database:

### USER_TOKENS Table
Stores Google OAuth tokens for each user:
- `user_id` (TEXT PRIMARY KEY) - Telegram user ID
- `refresh_token` (TEXT NOT NULL) - Google refresh token
- `access_token` (TEXT) - Google access token
- `expires_at` (INTEGER) - Token expiration timestamp
- `created_at` (INTEGER) - Record creation timestamp
- `updated_at` (INTEGER) - Last update timestamp

### UPLOADS Table
Tracks file upload progress and status:
- `id` (TEXT PRIMARY KEY) - Unique upload ID
- `user_id` (TEXT NOT NULL) - Telegram user ID
- `chat_id` (INTEGER NOT NULL) - Telegram chat ID
- `message_id` (INTEGER) - Telegram message ID for progress updates
- `file_name` (TEXT NOT NULL) - Original filename
- `total` (INTEGER NOT NULL) - Total file size in bytes
- `uploaded` (INTEGER DEFAULT 0) - Bytes uploaded so far
- `status` (TEXT DEFAULT 'queued') - Upload status (queued, uploading, completed, failed, cancelled)
- `started_at` (INTEGER) - Upload start timestamp
- `updated_at` (INTEGER) - Last progress update timestamp
- `cancel` (INTEGER DEFAULT 0) - Cancel flag (0/1)
- `file_id` (TEXT NOT NULL) - Telegram file ID
- `is_large_file` (INTEGER DEFAULT 0) - Large file flag (0/1)

## Troubleshooting

### Common Issues
- **OAuth `redirect_uri_mismatch`**: Add the exact redirect URI(s) shown above to your OAuth client
- **Telegram HTML error**: Keep `/help` HTML simple; use newlines (\n)
- **Webhook 404**: Ensure webhook URL uses `/bot` and deployment is up
- **Proxy/VPN issues with Wrangler**: Unset proxy env vars and set `NO_PROXY` for Cloudflare domains, then retry with `--verbose`

### File Upload Issues
- **Large file errors**: Files >20MB may not be processable due to Telegram's bot API limitations
- **Upload failures**: Check Google Drive permissions and storage quota
- **Progress not updating**: Ensure database tables are created correctly

### Error Messages
The bot provides detailed error information including:
- HTTP status codes and responses
- API error codes and descriptions
- File information (name, size, type)
- Timestamps for debugging
- Suggested solutions when possible

### Debug Mode
Enable detailed logging by checking the Cloudflare Workers logs:
```bash
npx wrangler tail
```
