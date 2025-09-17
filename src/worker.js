import { botHandler } from './bot.js';
import { siteHandler } from './site.js';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;

		// Debug logging
		console.log('Request method:', request.method);
		console.log('Request path:', path);
		console.log('Request URL:', request.url);

		// Handle GET requests (serve HTML files)
		if (request.method === 'GET') {
			return siteHandler(request, env, ctx);
		}

		// Handle POST requests (Telegram webhooks)
		if (request.method === 'POST') {
			return botHandler(request, env, ctx);
		}

		// Return 405 for other methods
		return new Response('Method not allowed', { status: 405 });
	},
};
