export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;

		// Handle GET requests (serve HTML files)
		if (request.method === 'GET') {
			// Handle specific routes
			if (path === '/policy' || path === '/policy.html') {
				try {
					const response = await env.ASSETS.fetch(new Request(`${url.origin}/policy.html`));
					return response;
				} catch (e) {
					return new Response('Policy page not found', { status: 404 });
				}
			}

			if (path === '/terms' || path === '/terms.html') {
				try {
					const response = await env.ASSETS.fetch(new Request(`${url.origin}/terms.html`));
					return response;
				} catch (e) {
					return new Response('Terms page not found', { status: 404 });
				}
			}

			// Serve other files from src/ directory
			try {
				const response = await env.ASSETS.fetch(request);
				return response;
			} catch (e) {
				// If file not found, try to serve Index.html
				try {
					const response = await env.ASSETS.fetch(new Request(`${url.origin}/Index.html`));
					return response;
				} catch (e2) {
					return new Response('Page not found', { status: 404 });
				}
			}
		}

		// Handle POST requests (Telegram webhooks)
		if (request.method === 'POST') {
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
		}

		// Return 405 for other methods
		return new Response('Method not allowed', { status: 405 });
	},
};
