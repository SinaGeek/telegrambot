// Telegram Bot for Cloudflare Workers
// This bot responds to /start command with "your Bot is Online"
// Serves HTML pages from src/ directory for browser requests

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Handle browser requests (GET requests)
		if (request.method === 'GET') {
			// Serve different HTML pages based on path
			if (url.pathname === '/privacy') {
				return serveHTMLFile('src/policy.html');
			} else if (url.pathname === '/terms') {
				return serveHTMLFile('src/terms.html');
			} else {
				return serveHTMLFile('src/Index.html');
			}
		}

		// Only handle POST requests (Telegram webhooks)
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
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
				if (text === '/start') {
					const responseText = 'your Bot is Online';

					// Send response back to Telegram
					const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							chat_id: chatId,
							text: responseText,
						}),
					});

					if (telegramResponse.ok) {
						return new Response('OK', { status: 200 });
					} else {
						console.error('Failed to send message to Telegram');
						return new Response('Error sending message', { status: 500 });
					}
				}
			}

			// Return OK for any other updates (ignore them)
			return new Response('OK', { status: 200 });
		} catch (error) {
			console.error('Error processing webhook:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

// Helper function to serve HTML files
async function serveHTMLFile(filePath) {
	try {
		// In a real Cloudflare Worker deployment with static assets,
		// you would use the asset handling system
		// For now, we'll return a simple response indicating the file
		return new Response(`Serving file: ${filePath}`, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	} catch (error) {
		return new Response('Page not found', { status: 404 });
	}
}
