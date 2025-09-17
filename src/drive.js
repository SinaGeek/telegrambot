/**
 * TODO: Implement your own user identification logic.
 * This is a critical security step. You must have a way to know which user is
 * making the request so you can retrieve the correct refresh token.
 * A common method is to have your main application create a JSON Web Token (JWT)
 * upon user login, which is then sent in the Authorization header of this worker request.
 *
 * @param {Request} request The incoming request object.
 * @returns {string | null} The unique ID of the user, or null if not authenticated.
 */
function getUserId(formData) {
	// Updated to take formData
	const userId = formData.get('userId');
	if (!userId) {
		throw new Error('User ID not provided.');
	}
	return userId;
}

export default {
	async fetch(request, env, ctx) {
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*', // IMPORTANT: Restrict this to your domain in production
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*', // IMPORTANT: Restrict this
			'Content-Type': 'application/json',
		};

		try {
			const formData = await request.formData();
			const userId = getUserId(formData); // Completed TODO: Now from formData for Telegram integration

			const authCode = formData.get('authCode');

			if (!authCode) {
				throw new Error('No authorization code provided.');
			}

			// Scenario: Login with authorization code
			const tokens = await getTokensFromCode(authCode, env);

			if (tokens.refresh_token) {
				// Completed TODO: Store refresh token in D1
				await env.DB.prepare(
					'INSERT INTO user_tokens (user_id, refresh_token) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token'
				)
					.bind(userId, tokens.refresh_token)
					.run();
				console.log(`DATABASE: Stored refresh_token for user ${userId}`);
			} else {
				console.warn(`No refresh token received for user ${userId}. They may have already authorized.`);
			}

			return new Response(JSON.stringify({ message: 'Signed in successfully!' }), {
				status: 200,
				headers: corsHeaders,
			});
		} catch (error) {
			console.error('Worker Error:', error.message);
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: corsHeaders,
			});
		}
	},
};

/**
 * Exchanges a one-time authorization code for an access token and a refresh token.
 * @param {string} code The authorization code from the frontend.
 * @param {object} env The worker environment containing secrets.
 * @returns {Promise<object>} An object containing access_token, refresh_token, etc.
 */
async function getTokensFromCode(code, env) {
	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

	// Completed TODO: Set redirect URI (use your deployed URL)
	const redirectUri = 'https://bot.turksafar.ir'; // Replace with your actual deployed URL

	const params = new URLSearchParams();
	params.append('client_id', env.GOOGLE_CLIENT_ID);
	params.append('client_secret', env.GOOGLE_CLIENT_SECRET);
	params.append('code', code);
	params.append('grant_type', 'authorization_code');
	params.append('redirect_uri', redirectUri);

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params,
	});

	const tokens = await response.json();
	if (!response.ok) {
		console.error('Token exchange failed:', tokens);
		throw new Error('Failed to exchange authorization code for tokens.');
	}
	return tokens;
}

/**
 * Uses a long-lived refresh token to get a new, short-lived access token.
 * @param {string} refreshToken The stored refresh token for the user.
 * @param {object} env The worker environment containing secrets.
 * @returns {Promise<string>} The new access token.
 */
async function getAccessTokenFromRefreshToken(refreshToken, env) {
	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

	const params = new URLSearchParams();
	params.append('client_id', env.GOOGLE_CLIENT_ID);
	params.append('client_secret', env.GOOGLE_CLIENT_SECRET);
	params.append('refresh_token', refreshToken);
	params.append('grant_type', 'refresh_token');

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params,
	});

	const tokens = await response.json();
	if (!response.ok || !tokens.access_token) {
		console.error('Refresh token exchange failed:', tokens);
		// This can happen if the user revoked permission from their Google account settings.
		// You should handle this by deleting the invalid refresh token from your database.
		throw new Error('Failed to refresh access token. The user may need to re-authenticate.');
	}
	return tokens.access_token;
}

/**
 * Uploads a file to Google Drive using a valid access token.
 * @param {File} file The file object to upload.
 * @param {string} accessToken The short-lived access token.
 * @returns {Promise<object>} The file resource object from the Google Drive API.
 */
async function uploadFileToDrive(file, accessToken) {
	const metadata = {
		name: file.name,
		// To upload to a specific folder, add: parents: ['FOLDER_ID']
	};

	const uploadBody = new FormData();
	uploadBody.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
	uploadBody.append('file', file);

	const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
		body: uploadBody,
	});

	if (!uploadResponse.ok) {
		const errorBody = await uploadResponse.json();
		throw new Error(`Google Drive API error: ${errorBody.error.message}`);
	}
	return await uploadResponse.json();
}
