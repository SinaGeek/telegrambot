// Telegram Bot for Cloudflare Workers
// This bot responds to /start command with "your Bot is Online"
// Serves HTML pages from src/ directory for browser requests

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle browser requests (GET requests)
    if (request.method === "GET") {
      // Serve different HTML pages based on path
      if (url.pathname === "/privacy") {
        return serveHTML("src/policy.html", env);
      } else if (url.pathname === "/terms") {
        return serveHTML("src/terms.html", env);
      } else {
        return serveHTML("src/Index.html", env);
      }
    }

    // Only handle POST requests (Telegram webhooks)
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      // Parse the incoming webhook data
      const update = await request.json();

      // Check if this is a message update
      if (update.message) {
        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text;

        // Handle /start command
        if (text === "/start") {
          const responseText = "your Bot is Online";

          // Send response back to Telegram
          const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: responseText,
            }),
          });

          if (telegramResponse.ok) {
            return new Response("OK", { status: 200 });
          } else {
            console.error("Failed to send message to Telegram");
            return new Response("Error sending message", { status: 500 });
          }
        }
      }

      // Return OK for any other updates (ignore them)
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

// Helper function to serve HTML files
async function serveHTML(filePath, env) {
  try {
    // Get the HTML file from KV storage (if using KV) or from file system
    // For now, we'll assume the files are available in the project
    // In a real Cloudflare Worker, you might want to use KV or serve from R2

    // This is a placeholder - in actual deployment, you might need to adjust
    // how you serve static files based on your setup
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Telegram Bot</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Telegram to Google Drive Bot</h1>
        <p>This bot helps you upload files from Telegram to Google Drive.</p>
        <p>Use the Telegram bot to interact with me!</p>
        <p><a href="/privacy">Privacy Policy</a> | <a href="/terms">Terms of Service</a></p>
    </div>
</body>
</html>`;

    return new Response(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response("Page not found", { status: 404 });
  }
}
