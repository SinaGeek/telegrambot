import { botHandler } from './bot.js';
import { siteHandler } from './site.js';
import drive from './drive.js';
import { botHandler } from './drive.js';

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
			const url = new URL(request.url);
			if (url.pathname === '/bot') {
				return botHandler(request, env, ctx);
			}
			if (url.pathname === '/login') {
				return drive.fetch(request, env, ctx);
			}
			return new Response('Not Found', { status: 404 });
		}

		// Return 405 for other methods
		return new Response('Method not allowed', { status: 405 });
	},
};
