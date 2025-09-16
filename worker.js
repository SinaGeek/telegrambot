// Telegram Bot for Cloudflare Workers
// This bot responds to /start command with "your Bot is Online"

export default {
  async fetch(request, env, ctx) {
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
