export async function siteHandler(request, env, ctx) {
	const url = new URL(request.url);
	const path = url.pathname;

	console.log('Handling GET request for path:', path);

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
			try {
				const response = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
				return response;
			} catch (e2) {
				return new Response('Index page not found', { status: 404 });
			}
		}
	}

	// Try to serve static files
	try {
		const response = await env.ASSETS.fetch(request);
		return response;
	} catch (e) {
		// If file not found, serve NotFound.html
		try {
			const response = await env.ASSETS.fetch(new Request(`${url.origin}/NotFound.html`));
			return new Response(response.body, {
				status: 404,
				headers: { 'Content-Type': 'text/html' },
			});
		} catch (e2) {
			return new Response('Page not found', { status: 404 });
		}
	}
}
