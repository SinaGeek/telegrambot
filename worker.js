import { handleTelegramWebhook } from './src/bot.js';

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

			// Handle root path - serve Index.html
			if (path === '/' || path === '/index.html') {
				try {
					const response = await env.ASSETS.fetch(new Request(`${url.origin}/Index.html`));
					return response;
				} catch (e) {
					// Try with lowercase filename
					try {
						const response = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
						return response;
					} catch (e2) {
						return new Response('Index page not found', { status: 404 });
					}
				}
			}

			// Serve other files from src/ directory
			try {
				const response = await env.ASSETS.fetch(request);
				return response;
			} catch (e) {
				// If file not found, serve NotFound.html
				try {
					const response = await env.ASSETS.fetch(new Request(`${url.origin}/notfound.html`));
					return new Response(response.body, {
						status: 404,
						headers: { 'Content-Type': 'text/html' },
					});
				} catch (e2) {
					// Try with lowercase filename
					try {
						const response = await env.ASSETS.fetch(new Request(`${url.origin}/notfound.html`));
						return new Response(response.body, {
							status: 404,
							headers: { 'Content-Type': 'text/html' },
						});
					} catch (e3) {
						return new Response('Page not found', { status: 404 });
					}
				}
			}
		}

		// Handle POST requests (Telegram webhooks)
		if (request.method === 'POST') {
			try {
				// Parse the incoming webhook data
				const update = await request.json();

				// Handle the Telegram webhook using the bot logic
				return await handleTelegramWebhook(update, env);
			} catch (error) {
				console.error('Error processing webhook:', error);
				return new Response('Internal Server Error', { status: 500 });
			}
		}

		// Return 405 for other methods
		return new Response('Method not allowed', { status: 405 });
	},
};
