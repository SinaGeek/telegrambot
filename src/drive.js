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

			// Ensure database schema exists
			await ensureSchema(env);
			await ensureUploadsSchema(env);

			// Scenario: Login with authorization code
			const tokens = await getTokensFromCode(authCode, env);

			if (tokens.refresh_token) {
				// Completed TODO: Store refresh token in D1
				await env.DB.prepare(
					'INSERT INTO USER_TOKENS (user_id, refresh_token) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token'
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

	// Redirect URI must match the one used in /login link and in Google Console
	const redirectUri = 'https://bot.turksafar.ir/googlesignin.html';

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

/** Ensure D1 schema exists */
async function ensureSchema(env) {
	// Create table with unique user_id for upsert to work
	await env.DB.prepare('CREATE TABLE IF NOT EXISTS USER_TOKENS (user_id TEXT PRIMARY KEY, refresh_token TEXT NOT NULL)').run();
}

async function ensureUploadsSchema(env) {
	await env.DB.prepare(
		'CREATE TABLE IF NOT EXISTS UPLOADS (id TEXT PRIMARY KEY, user_id TEXT, chat_id TEXT, message_id INTEGER, file_name TEXT, total INTEGER, uploaded INTEGER, status TEXT, started_at INTEGER, updated_at INTEGER, cancel INTEGER DEFAULT 0)'
	).run();
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
 * Upload a file to Google Drive (matches usage in bot.js)
 * @param {string} fileName
 * @param {ArrayBuffer} fileContent
 * @param {string} accessToken
 */
async function uploadFileToDrive(fileName, fileContent, accessToken) {
	const metadata = { name: fileName };

	const boundary = `-------wowdrive-${crypto.randomUUID()}`;
	const encoder = new TextEncoder();

	const part1 = encoder.encode(
		`--${boundary}\r\n` + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + `${JSON.stringify(metadata)}\r\n`
	);
	const part2Header = encoder.encode(`--${boundary}\r\n` + 'Content-Type: application/octet-stream\r\n\r\n');
	const part3 = encoder.encode(`\r\n--${boundary}--\r\n`);

	const body = new Blob([part1, part2Header, new Uint8Array(fileContent), part3], {
		type: `multipart/related; boundary=${boundary}`,
	});

	const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}` },
		body,
	});

	if (!uploadResponse.ok) {
		let message = 'Unknown error';
		try {
			const errorBody = await uploadResponse.json();
			message = (errorBody && errorBody.error && errorBody.error.message) || JSON.stringify(errorBody);
		} catch (e) {}
		throw new Error(`Google Drive API error: ${message}`);
	}
	return await uploadResponse.json();
}

/**
 * Retrieve a fresh access token for a user via stored refresh token in D1
 * @param {string} userId
 * @param {any} env
 */
async function getAccessToken(userId, env) {
	const row = await env.DB.prepare('SELECT refresh_token FROM USER_TOKENS WHERE user_id = ?').bind(userId).first();
	const refreshToken = row && row.refresh_token;
	if (!refreshToken) {
		throw new Error('No Google account linked. Use /login to connect.');
	}
	return await getAccessTokenFromRefreshToken(refreshToken, env);
}

/** List recent files */
async function listDriveFiles(accessToken) {
	const resp = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name)', {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const data = await resp.json();
	if (!resp.ok) {
		throw new Error((data && data.error && data.error.message) || 'Failed to list files');
	}
	return data.files || [];
}

/** Rename a Drive file */
async function renameDriveFile(fileId, newName, accessToken) {
	const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ name: newName }),
	});
	if (!resp.ok) {
		let data = null;
		try {
			data = await resp.json();
		} catch (e) {}
		throw new Error((data && data.error && data.error.message) || 'Failed to rename file');
	}
}

/** Delete a Drive file */
async function deleteDriveFile(fileId, accessToken) {
	const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!resp.ok) {
		let data = null;
		try {
			data = await resp.json();
		} catch (e) {}
		throw new Error((data && data.error && data.error.message) || 'Failed to delete file');
	}
}

export { getAccessToken, uploadFileToDrive, listDriveFiles, renameDriveFile, deleteDriveFile };
/**
 * Ensure a folder exists in Drive, return its ID.
 */
async function getOrCreateFolder(folderName, accessToken) {
	// Try to find existing folder
	const q = encodeURIComponent(
		`name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
	);
	let resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	let data = await resp.json();
	if (resp.ok && data.files && data.files.length > 0) {
		return data.files[0].id;
	}
	// Create folder
	resp = await fetch('https://www.googleapis.com/drive/v3/files', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
	});
	data = await resp.json();
	if (!resp.ok) {
		throw new Error(data?.error?.message || 'Failed to create folder');
	}
	return data.id;
}

/**
 * Start a resumable upload session for Drive v3.
 */
async function startResumableSession(fileName, totalBytes, parents, accessToken) {
	const metadata = { name: fileName };
	if (parents && parents.length > 0) metadata.parents = parents;
	const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json; charset=UTF-8',
			'X-Upload-Content-Type': 'application/octet-stream',
			'X-Upload-Content-Length': String(totalBytes),
		},
		body: JSON.stringify(metadata),
	});
	if (!resp.ok) {
		const t = await resp.text();
		throw new Error(`Failed to start upload session: ${t}`);
	}
	const sessionUrl = resp.headers.get('Location');
	if (!sessionUrl) throw new Error('Upload session URL missing');
	return sessionUrl;
}

/**
 * Upload buffer in chunks to a resumable session, calling onProgress after each chunk.
 * Checks cancel flag in DB if uploadId provided.
 */
async function uploadResumable(sessionUrl, buffer, chunkSize, onProgress, options) {
	const total = buffer.byteLength;
	let offset = 0;
	const view = new Uint8Array(buffer);
	const startedAt = Date.now();
	while (offset < total) {
		const end = Math.min(offset + chunkSize, total);
		const chunk = view.slice(offset, end);
		const resp = await fetch(sessionUrl, {
			method: 'PUT',
			headers: {
				'Content-Length': String(chunk.byteLength),
				'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
			},
			body: chunk,
		});
		if (!(resp.status === 200 || resp.status === 201 || resp.status === 308)) {
			const t = await resp.text();
			throw new Error(`Upload failed: ${resp.status} ${t}`);
		}
		offset = end;
		if (typeof onProgress === 'function') {
			await onProgress({ uploaded: offset, total, startedAt });
		}
		if (options && options.checkCancel && options.env && options.uploadId) {
			const row = await options.env.DB.prepare('SELECT cancel FROM UPLOADS WHERE id = ?').bind(options.uploadId).first();
			if (row && row.cancel) throw new Error('Upload cancelled by user');
		}
	}
	// Final response body for 200/201 contains file resource; fetch it if last response wasn't captured
	const finalResp = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } });
	// ignore status; session should be complete
}

/**
 * Get Drive stats (user display name, email, storage quota)
 */
async function getDriveStats(accessToken) {
	const resp = await fetch(
		'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage,usageInDriveTrash)',
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		}
	);
	const data = await resp.json();
	if (!resp.ok) {
		throw new Error(data?.error?.message || 'Failed to fetch stats');
	}
	return data;
}

export { getOrCreateFolder, startResumableSession, uploadResumable, getDriveStats };
