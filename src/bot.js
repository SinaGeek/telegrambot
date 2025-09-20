import {
	getAccessToken,
	uploadFileToDrive,
	listDriveFiles,
	renameDriveFile,
	deleteDriveFile,
	getOrCreateFolder,
	startResumableSession,
	uploadResumable,
	getDriveStats,
} from './drive.js';

export async function botHandler(request, env, ctx) {
	console.log('Handling POST request (Telegram webhook)');
	try {
		// Parse the incoming webhook data
		const update = await request.json();
		console.log('Received update:', JSON.stringify(update, null, 2));

		// Check if this is a message update
		if (update.message) {
			const message = update.message;
			const chatId = message.chat.id;
			const text = message.text;
			const userId = message.from.id.toString(); // Use Telegram user ID as key
			console.log('Message received:', { chatId, text });

			// Handle /start command
			if (text === '/start') {
				console.log('Handling /start command');
				await sendTelegramMessage(env, chatId, 'your Bot is Online');
				return new Response('OK', { status: 200 });
			}

			// Handle /help command
			if (text === '/help') {
				console.log('Handling /help command');

				const helpText = `
🤖 WOWDrive Bot — Upload from Telegram to Google Drive

📋 Commands
• /start — Start the bot
• /help — Show this help message
• /login — Connect your Google Drive account
• /stat — Show your Drive storage usage
• /list — List your recent files
• /rename <fileId> <newName> — Rename a file
• /remove <fileId> — Delete a file
• /privacy — Privacy Policy & Terms

📤 Upload Files
• Send any document, photo, or video to upload to Drive
• Small files (≤20MB): Direct upload
• Large files (>20MB): Chunked upload with progress tracking
• Use buttons to cancel or view progress

⚡ Upload Process
1️⃣ Request added to the queue!
2️⃣ Starting to upload...
3️⃣ Progress updates every 20 seconds
4️⃣ Upload completed!

Website: https://bot.turksafar.ir
			`;

				const replyMarkup = {
					inline_keyboard: [
						[
							{ text: '🔐 Login', callback_data: 'show_login' },
							{ text: '📄 Privacy', url: 'https://bot.turksafar.ir/policy' },
							{ text: '📋 Terms', url: 'https://bot.turksafar.ir/terms' },
						],
						[{ text: '🌐 Website', url: 'https://bot.turksafar.ir' }],
					],
				};

				await sendTelegramMessageWithButtons(env, chatId, helpText, replyMarkup.inline_keyboard);
				return new Response('OK', { status: 200 });
			}

			// New /login command - send direct Google OAuth consent URL
			if (text === '/login') {
				const oauthUrl = generateOAuthUrl(env, userId);
				await sendTelegramMessageWithButtons(env, chatId, 'Tap to connect your Google Drive:', [
					[{ text: '🔐 Sign in with Google', url: oauthUrl }],
				]);
				return new Response('OK', { status: 200 });
			}
		}

		// Handle callback queries
		if (update.callback_query) {
			const cq = update.callback_query;
			const data = cq.data;
			const cqChatId = cq.message ? cq.message.chat.id : cq.from.id;

			if (data === 'show_login') {
				const userIdCb = (cq.from && cq.from.id ? cq.from.id : cqChatId).toString();
				const oauthUrl = generateOAuthUrl(env, userIdCb);
				await sendTelegramMessage(env, cqChatId, `Tap to connect your Google Drive:\n${oauthUrl}`);
				await answerCallbackQuery(env, cq.id);
				return new Response('OK', { status: 200 });
			}

			// Handle upload confirmation
			if (data === 'confirm_upload') {
				const cqUserId = cq.from.id.toString();
				const cqChatId = cq.message ? cq.message.chat.id : cq.from.id;
				const progressMessageId = cq.message ? cq.message.message_id : null;

				// Find the upload record for this user
				const activeUpload = await env.DB.prepare(
					'SELECT * FROM UPLOADS WHERE user_id = ? AND status = "queued" ORDER BY started_at DESC LIMIT 1'
				)
					.bind(cqUserId)
					.first();

				if (activeUpload) {
					// Start the upload process
					await editTelegramMessage(env, cqChatId, progressMessageId, '1️⃣ Request added to the queue!\n\n2️⃣ Starting to upload...');
					await env.DB.prepare('UPDATE UPLOADS SET status = "uploading" WHERE id = ?').bind(activeUpload.id).run();

					// Process the upload - use chunked upload for large files
					if (activeUpload.is_large_file) {
						await uploadLargeFileChunked(env, activeUpload, cqChatId, progressMessageId);
					} else {
						await processFileUpload(env, activeUpload, cqChatId, progressMessageId);
					}
				} else {
					await answerCallbackQuery(env, cq.id, 'No pending upload found', true);
				}
				return new Response('OK', { status: 200 });
			}

			// Handle upload cancel
			if (data === 'cancel_upload') {
				const cqUserId = cq.from.id.toString();
				// Find active upload for this user
				const activeUpload = await env.DB.prepare(
					'SELECT id, file_name FROM UPLOADS WHERE user_id = ? AND status = "uploading" ORDER BY started_at DESC LIMIT 1'
				)
					.bind(cqUserId)
					.first();

				if (activeUpload) {
					// Mark as cancelled
					await env.DB.prepare('UPDATE UPLOADS SET cancel = 1, status = "cancelled" WHERE id = ?').bind(activeUpload.id).run();
					await answerCallbackQuery(env, cq.id, `Upload cancelled: ${activeUpload.file_name}`, true);
				} else {
					await answerCallbackQuery(env, cq.id, 'No active upload found', true);
				}
				return new Response('OK', { status: 200 });
			}

			// Handle view progress
			if (data === 'view_progress') {
				const cqUserId = cq.from.id.toString();
				const activeUpload = await env.DB.prepare(
					'SELECT * FROM UPLOADS WHERE user_id = ? AND status = "uploading" ORDER BY started_at DESC LIMIT 1'
				)
					.bind(cqUserId)
					.first();

				if (activeUpload) {
					const elapsedSec = Math.max(1, Math.floor((Date.now() - activeUpload.started_at) / 1000));
					const speed = activeUpload.uploaded / elapsedSec;
					const remaining = Math.max(0, activeUpload.total - activeUpload.uploaded);
					const etaSec = Math.floor(remaining / Math.max(1, speed));
					const percent = (activeUpload.uploaded / activeUpload.total) * 100;
					const barBlocks = Math.round(percent / 10);
					const bar = '🟩'.repeat(barBlocks) + '⬜️'.repeat(10 - barBlocks);
					const fmt = (b) =>
						b >= 1024 * 1024 * 1024 ? (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : (b / (1024 * 1024)).toFixed(1) + ' MB';
					const hhmmss = (s) => {
						const h = Math.floor(s / 3600);
						const m = Math.floor((s % 3600) / 60);
						const sec = s % 60;
						return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
					};
					const progressText = `📊 Upload Progress\n\n${activeUpload.file_name}\n\n${fmt(activeUpload.uploaded)} of ${fmt(
						activeUpload.total
					)} done\n${bar} (${percent.toFixed(2)}%)\nSpeed: ${(speed / (1024 * 1024)).toFixed(1)} MB/s\nElapsed: ${hhmmss(
						elapsedSec
					)}\nETA: ${hhmmss(etaSec)}`;

					await answerCallbackQuery(env, cq.id, progressText, true);
				} else {
					await answerCallbackQuery(env, cq.id, 'No active upload found', true);
				}
				return new Response('OK', { status: 200 });
			}

			await answerCallbackQuery(env, cq.id);
			return new Response('OK', { status: 200 });
		}

		// Handle file upload (if message has document, photo, or video)
		if (update.message && (update.message.document || update.message.photo || update.message.video)) {
			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id.toString();

			try {
				const accessToken = await getAccessToken(userId, env);

				// Extract file information
				const fileInfo = extractFileInfo(message);
				if (!fileInfo) {
					throw new Error('No file found in message');
				}

				const { fileId, fileName, fileSize } = fileInfo;
				const maxFileSize = 20 * 1024 * 1024; // 20MB
				const isLargeFile = fileSize && fileSize > maxFileSize;

				// Check file size and provide appropriate feedback
				if (isLargeFile) {
					const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
					console.log(`Large file detected: ${fileName} (${fileSizeMB} MB) - using chunked upload`);

					// For very large files, we need to inform the user about limitations
					if (fileSize > 2 * 1024 * 1024 * 1024) {
						// 2GB limit
						throw new Error(
							`File too large: This file (${fileName}) is ${(fileSize / (1024 * 1024 * 1024)).toFixed(
								1
							)} GB. Maximum supported size is 2GB. Please compress the file or split it into smaller parts.`
						);
					}
				}

				// Handle files of any size - but acknowledge Telegram's limitations
				let downloadUrl, telegramFileName;
				if (isLargeFile) {
					// For large files, try to get the file path from Telegram
					try {
						const fileInfo = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then((res) =>
							res.json()
						);
						if (fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
							downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
							telegramFileName = fileName;
						} else {
							// If getFile fails for large files, we cannot proceed
							// Telegram doesn't allow direct access to files >20MB through bot API
							throw new Error(
								`This file (${fileName}) is too large for processing through Telegram's bot API. Telegram has a 20MB limit for bot file downloads. Please try with a smaller file or use a different method to upload it to Google Drive.`
							);
						}
					} catch (error) {
						// If getFile fails, we cannot proceed with the download
						throw new Error(
							`Unable to process this large file (${fileName}). Telegram's bot API has limitations on file access for files larger than 20MB. Please try with a smaller file or use a different upload method.`
						);
					}
				} else {
					// For small files, use the normal approach
					const result = await getTelegramFileInfo(env.TELEGRAM_BOT_TOKEN, fileId);
					downloadUrl = result.downloadUrl;
					telegramFileName = result.fileName;
				}

				// Show file info and ask for approval
				const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
				const uploadType = isLargeFile ? ' (Chunked Upload)' : '';
				const approvalText = `📤 File Upload Request${uploadType}\n\n📁 File: ${fileName}\n📊 Size: ${fileSizeMB} MB\n\nDo you want to upload this file to Google Drive?`;

				const queued = await sendTelegramMessageWithButtons(env, chatId, approvalText, [
					[
						{ text: '✅ Upload to Drive', callback_data: 'confirm_upload' },
						{ text: '❌ Cancel', callback_data: 'cancel_upload' },
					],
				]);

				const queuedMsg = await queued.json().catch(() => ({}));
				const progressMessageId = queuedMsg?.result?.message_id;

				// Create upload record
				await createUploadRecord(env, {
					userId,
					chatId,
					messageId: progressMessageId,
					fileName,
					fileId,
					total: fileSize,
					isLargeFile,
				});
			} catch (error) {
				console.error('File upload error:', error);
				const errorDetails = {
					message: error.message,
					fileId: fileId,
					fileName: fileName,
					fileSize: fileSize,
					isLargeFile: isLargeFile,
					timestamp: new Date().toISOString(),
				};
				await sendTelegramMessage(
					env,
					chatId,
					`❌ Upload Error\n\n${error.message}\n\nDebug Info:\nFile: ${fileName}\nSize: ${(fileSize / (1024 * 1024)).toFixed(
						1
					)} MB\nType: ${isLargeFile ? 'Large File' : 'Small File'}\nTime: ${new Date().toLocaleString()}`
				);
			}
			return new Response('OK', { status: 200 });
		}

		// /list command (lists files)
		if (update.message && update.message.text === '/list') {
			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id.toString();
			try {
				const accessToken = await getAccessToken(userId, env);
				const files = await listDriveFiles(accessToken);
				const fileList = files.map((f) => `${f.name} (ID: ${f.id})`).join('\n') || 'No files found.';
				await sendTelegramMessage(env, chatId, `Your Drive files:\n${fileList}`);
			} catch (error) {
				console.error('List files error:', error);
				await sendTelegramMessage(env, chatId, `❌ Error listing files: ${error.message}`);
			}
			return new Response('OK', { status: 200 });
		}

		// /stat command (show user and storage usage)
		if (update.message && update.message.text === '/stat') {
			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id.toString();
			try {
				const accessToken = await getAccessToken(userId, env);
				const about = await getDriveStats(accessToken);
				const name = about.user?.displayName || 'Unknown';
				const email = about.user?.emailAddress || 'Unknown';
				const limit = Number(about.storageQuota?.limit || 0);
				const usage = Number(about.storageQuota?.usage || 0);
				const trash = Number(about.storageQuota?.usageInDriveTrash || 0);
				const free = Math.max(0, limit - usage);
				const pct = limit ? (usage / limit) * 100 : 0;
				const barBlocks = Math.round(pct / 10);
				const bar = '🟩'.repeat(barBlocks) + '⬜️'.repeat(10 - barBlocks);
				const fmt = (b) =>
					b >= 1024 * 1024 * 1024 ? (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : (b / (1024 * 1024)).toFixed(1) + ' MB';
				const textStat = `Display Name: ${name}\n\nEmail: ${email}\n\nTotal Available Storage: ${fmt(limit)}\n\nTotal Storage Used: ${fmt(
					usage
				)}\n\nTotal Storage Used in Trash: ${fmt(trash)}\n\nTotal Free storage: ${fmt(free)}\n\n${bar}\n(${pct.toFixed(2)}%) used of ${fmt(
					limit
				)}.`;
				await sendTelegramMessage(env, chatId, textStat);
			} catch (error) {
				console.error('Stats error:', error);
				await sendTelegramMessage(env, chatId, `❌ Error getting stats: ${error.message}`);
			}
			return new Response('OK', { status: 200 });
		}

		// /rename <fileId> <newName>
		if (update.message && update.message.text && update.message.text.startsWith('/rename ')) {
			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id.toString();
			try {
				const [, fileId, newName] = update.message.text.split(' ');
				const accessToken = await getAccessToken(userId, env);
				await renameDriveFile(fileId, newName, accessToken);
				await sendTelegramMessage(env, chatId, `File renamed to ${newName}`);
			} catch (error) {
				console.error('Rename error:', error);
				await sendTelegramMessage(env, chatId, `❌ Error renaming file: ${error.message}`);
			}
			return new Response('OK', { status: 200 });
		}

		// /remove <fileId>
		if (update.message && update.message.text && update.message.text.startsWith('/remove ')) {
			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id.toString();
			try {
				const [, fileId] = update.message.text.split(' ');
				const accessToken = await getAccessToken(userId, env);
				await deleteDriveFile(fileId, accessToken);
				await sendTelegramMessage(env, chatId, 'File removed successfully');
			} catch (error) {
				console.error('Remove error:', error);
				await sendTelegramMessage(env, chatId, `❌ Error removing file: ${error.message}`);
			}
			return new Response('OK', { status: 200 });
		}

		// Handle /privacy command
		if (update.message && update.message.text === '/privacy') {
			const message = update.message;
			const chatId = message.chat.id;
			console.log('Handling /privacy command');
			const privacyText = `
🔒 Privacy Policy & Terms of Service

📋 Privacy Policy: https://bot.turksafar.ir/policy
📋 Terms of Service: https://bot.turksafar.ir/terms
			`;

			await sendTelegramMessage(env, chatId, privacyText);
			return new Response('OK', { status: 200 });
		}

		// Return OK for any other updates (ignore them)
		console.log('No message found in update, returning OK');
		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('Error processing webhook:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function sendTelegramMessage(env, chatId, text) {
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text }),
	});
}

async function sendTelegramMessageWithButtons(env, chatId, text, inlineKeyboard) {
	return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }),
	});
}

async function editTelegramMessage(env, chatId, messageId, text) {
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
	});
}

// Helper function to extract file information from message
function extractFileInfo(message) {
	if (message.document) {
		return {
			fileId: message.document.file_id,
			fileName: message.document.file_name,
			fileSize: message.document.file_size,
		};
	} else if (message.video) {
		return {
			fileId: message.video.file_id,
			fileName: message.video.file_name || 'video.mp4',
			fileSize: message.video.file_size,
		};
	} else if (message.photo) {
		const photo = message.photo[message.photo.length - 1];
		return {
			fileId: photo.file_id,
			fileName: 'photo.jpg',
			fileSize: photo.file_size,
		};
	}
	return null;
}

// Helper function to create upload record
async function createUploadRecord(env, { userId, chatId, messageId, fileName, fileId, total, isLargeFile }) {
	const uploadId = crypto.randomUUID();
	await env.DB.prepare(
		'INSERT INTO UPLOADS (id, user_id, chat_id, message_id, file_name, file_id, total, uploaded, status, started_at, updated_at, is_large_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
	)
		.bind(uploadId, userId, chatId, messageId, fileName, fileId, total, 0, 'queued', Date.now(), Date.now(), isLargeFile ? 1 : 0)
		.run();
}

// Helper function to generate OAuth URL
function generateOAuthUrl(env, userId) {
	const clientId = env.GOOGLE_CLIENT_ID;
	const redirectUri = 'https://bot.turksafar.ir/googlesignin.html';
	const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
	const state = encodeURIComponent(userId);
	return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(
		redirectUri
	)}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;
}

// Helper function to answer callback queries
async function answerCallbackQuery(env, callbackQueryId, text = '', showAlert = false) {
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			callback_query_id: callbackQueryId,
			text,
			show_alert: showAlert,
		}),
	});
}

// Resumable download function for large files from Telegram
async function streamTelegramFile(botToken, fileId) {
	// Get the direct file URL and filename from the Telegram API
	const { downloadUrl, fileName } = await getTelegramFileInfo(botToken, fileId);

	// Fetch the file from Telegram's servers
	const fileResponse = await fetch(downloadUrl);

	if (!fileResponse.ok) {
		throw new Error(`Failed to download file from Telegram: ${fileResponse.status} ${fileResponse.statusText}`);
	}

	return {
		stream: fileResponse.body,
		fileName: fileName,
		contentLength: fileResponse.headers.get('content-length') ? parseInt(fileResponse.headers.get('content-length')) : null,
	};
}

// Enhanced getTelegramFileInfo function based on your sample
async function getTelegramFileInfo(botToken, fileId) {
	const apiUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
	const response = await fetch(apiUrl);

	if (!response.ok) {
		const errorText = await response.text().catch(() => 'Unknown error');
		let errorDetails = `Status: ${response.status} ${response.statusText}`;

		try {
			const errorJson = JSON.parse(errorText);
			errorDetails += `\nError Code: ${errorJson.error_code || 'N/A'}`;
			errorDetails += `\nDescription: ${errorJson.description || 'N/A'}`;
			errorDetails += `\nParameters: ${errorJson.parameters ? JSON.stringify(errorJson.parameters) : 'N/A'}`;
		} catch (e) {
			errorDetails += `\nRaw Error: ${errorText}`;
		}

		throw new Error(`Telegram API error when calling getFile:\n${errorDetails}`);
	}

	const data = await response.json();
	if (!data.ok || !data.result || !data.result.file_path) {
		let errorDetails = `Response: ${JSON.stringify(data)}`;
		if (data.error_code) errorDetails += `\nError Code: ${data.error_code}`;
		if (data.description) errorDetails += `\nDescription: ${data.description}`;
		if (data.parameters) errorDetails += `\nParameters: ${JSON.stringify(data.parameters)}`;

		throw new Error(`Invalid response from Telegram getFile API:\n${errorDetails}`);
	}

	const filePath = data.result.file_path;
	const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
	const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

	return { downloadUrl, fileName };
}

// Upload large file to Google Drive with progress tracking
async function uploadLargeFileToDriveWithProgress(env, accessToken, uploadRecord, downloadUrl, folderId, chatId, messageId) {
	console.log(`Starting resumable upload for: ${uploadRecord.file_name}`);

	// Step 1: Initiate the Resumable Upload Session
	const metadata = {
		name: uploadRecord.file_name,
		parents: [folderId],
	};

	const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json; charset=UTF-8',
		},
		body: JSON.stringify(metadata),
	});

	if (!initResponse.ok) {
		const errorBody = await initResponse.text();
		let errorDetails = `Status: ${initResponse.status} ${initResponse.statusText}`;
		errorDetails += `\nResponse: ${errorBody}`;

		// Try to parse as JSON for structured error info
		try {
			const errorJson = JSON.parse(errorBody);
			if (errorJson.error) {
				errorDetails += `\nError: ${JSON.stringify(errorJson.error)}`;
			}
			if (errorJson.message) {
				errorDetails += `\nMessage: ${errorJson.message}`;
			}
		} catch (e) {
			// Not JSON, use raw text
		}

		throw new Error(`Failed to initiate upload session:\n${errorDetails}`);
	}

	const uploadUrl = initResponse.headers.get('Location');
	if (!uploadUrl) {
		throw new Error('Could not get the resumable upload URL from the API response.');
	}

	console.log('Session initiated. Starting file download and upload...');

	// Step 2: Stream the file from Telegram and upload to Google Drive
	const fileResponse = await fetch(downloadUrl);

	if (!fileResponse.ok) {
		// If the direct download fails, try alternative approaches
		console.log(`Direct download failed with status ${fileResponse.status}, trying alternative approach...`);

		// Get detailed error information
		let errorDetails = `Status: ${fileResponse.status} ${fileResponse.statusText}`;
		try {
			const errorText = await fileResponse.text();
			errorDetails += `\nResponse: ${errorText}`;

			// Try to parse as JSON for structured error info
			try {
				const errorJson = JSON.parse(errorText);
				if (errorJson.error_code) errorDetails += `\nError Code: ${errorJson.error_code}`;
				if (errorJson.description) errorDetails += `\nDescription: ${errorJson.description}`;
				if (errorJson.parameters) errorDetails += `\nParameters: ${JSON.stringify(errorJson.parameters)}`;
			} catch (e) {
				// Not JSON, use raw text
			}
		} catch (e) {
			errorDetails += `\nCould not read error response`;
		}

		throw new Error(
			`Failed to download file from Telegram:\n${errorDetails}\n\nPlease try again or contact support if the issue persists.`
		);
	}

	const reader = fileResponse.body.getReader();
	const chunks = [];
	let totalDownloaded = 0;
	let lastEdit = 0;

	// Read the file in chunks
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		chunks.push(value);
		totalDownloaded += value.length;

		// Update progress every 5MB or every 20 seconds
		const now = Date.now();
		if (totalDownloaded % (5 * 1024 * 1024) === 0 || now - lastEdit > 20000) {
			lastEdit = now;
			const percent = (totalDownloaded / uploadRecord.total) * 100;
			const barBlocks = Math.round(percent / 10);
			const bar = '🟩'.repeat(barBlocks) + '⬜️'.repeat(10 - barBlocks);
			const fmt = (b) => (b >= 1024 * 1024 * 1024 ? (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : (b / (1024 * 1024)).toFixed(1) + ' MB');

			const txt = `3️⃣ Downloading & Uploading...\n${uploadRecord.file_name}\n\nDownloaded: ${fmt(totalDownloaded)} of ${fmt(
				uploadRecord.total
			)}\n${bar} (${percent.toFixed(2)}%)\n\nProcessing large file...`;

			await editTelegramMessage(env, chatId, messageId, txt);

			// Update database with progress
			await env.DB.prepare('UPDATE UPLOADS SET uploaded = ?, updated_at = ? WHERE id = ?')
				.bind(totalDownloaded, Date.now(), uploadRecord.id)
				.run();
		}
	}

	// Combine chunks into a single Uint8Array
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const fileData = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		fileData.set(chunk, offset);
		offset += chunk.length;
	}

	// Step 3: Upload to Google Drive
	const uploadResponse = await fetch(uploadUrl, {
		method: 'PUT',
		headers: {
			'Content-Length': fileData.length,
		},
		body: fileData,
	});

	if (!uploadResponse.ok) {
		const errorBody = await uploadResponse.text();
		let errorDetails = `Status: ${uploadResponse.status} ${uploadResponse.statusText}`;
		errorDetails += `\nResponse: ${errorBody}`;

		// Try to parse as JSON for structured error info
		try {
			const errorJson = JSON.parse(errorBody);
			if (errorJson.error) {
				errorDetails += `\nError: ${JSON.stringify(errorJson.error)}`;
			}
			if (errorJson.message) {
				errorDetails += `\nMessage: ${errorJson.message}`;
			}
		} catch (e) {
			// Not JSON, use raw text
		}

		throw new Error(`File upload failed:\n${errorDetails}`);
	}

	console.log('File upload successful!');
	return await uploadResponse.json();
}

async function processFileUpload(env, uploadRecord, chatId, messageId) {
	try {
		const accessToken = await getAccessToken(uploadRecord.user_id, env);

		// Get file info from Telegram - handle any file size
		let downloadUrl, telegramFileName;
		try {
			const result = await getTelegramFileInfo(env.TELEGRAM_BOT_TOKEN, uploadRecord.file_id);
			downloadUrl = result.downloadUrl;
			telegramFileName = result.fileName;
		} catch (error) {
			// If getFile fails for large files, we cannot proceed
			console.log('getFile API failed for large file:', error.message);
			throw new Error(
				`Unable to process this large file (${uploadRecord.file_name}). Telegram's bot API has limitations on file access for files larger than 20MB. Please try with a smaller file or use a different upload method.`
			);
		}

		// Fetch file content
		const fileContent = await fetch(downloadUrl).then((res) => res.arrayBuffer());

		// Ensure folder GDUPLODER
		const folderId = await getOrCreateFolder('GDUPLODER', accessToken);

		// Resumable upload with progress
		const parents = [folderId];
		const sessionUrl = await startResumableSession(uploadRecord.file_name, uploadRecord.total, parents, accessToken);

		const start = Date.now();
		let lastEdit = 0;
		await uploadResumable(
			sessionUrl,
			fileContent,
			5 * 1024 * 1024, // 5MB chunks
			async ({ uploaded, total, startedAt }) => {
				// Update database with progress
				await env.DB.prepare('UPDATE UPLOADS SET uploaded = ?, updated_at = ? WHERE id = ?')
					.bind(uploaded, Date.now(), uploadRecord.id)
					.run();

				const now = Date.now();
				if (now - lastEdit < 20000) return; // update every ~20s
				lastEdit = now;
				const elapsedSec = Math.max(1, Math.floor((now - startedAt) / 1000));
				const speed = uploaded / elapsedSec; // bytes/sec
				const remaining = Math.max(0, total - uploaded);
				const etaSec = Math.floor(remaining / Math.max(1, speed));
				const percent = (uploaded / total) * 100;
				const barBlocks = Math.round(percent / 10);
				const bar = '🟩'.repeat(barBlocks) + '⬜️'.repeat(10 - barBlocks);
				const fmt = (b) =>
					b >= 1024 * 1024 * 1024 ? (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : (b / (1024 * 1024)).toFixed(1) + ' MB';
				const hhmmss = (s) => {
					const h = Math.floor(s / 3600);
					const m = Math.floor((s % 3600) / 60);
					const sec = s % 60;
					return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
				};
				const txt = `3️⃣ Uploading...\n${uploadRecord.file_name}.\n\n${fmt(uploaded)} of ${fmt(total)} done.\n${bar} (${percent.toFixed(
					2
				)}%)\nSpeed ${(speed / (1024 * 1024)).toFixed(1)} MB/s\nElapsed Time: ${hhmmss(elapsedSec)}\nETA: ${hhmmss(
					etaSec
				)}\n\nProgress will be updated every 20s to get latest status use the button.\n\nYou are on free plan. You can only transfer at maximum 1MB/s. /upgrade to get better transfer speeds (upto 3.33 MB/s for this process and save 0:00:11 in waiting).`;

				// Update message with buttons
				await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						message_id: messageId,
						text: txt,
						reply_markup: {
							inline_keyboard: [
								[
									{ text: '❌ Cancel', callback_data: 'cancel_upload' },
									{ text: '📈 View progress', callback_data: 'view_progress' },
								],
							],
						},
					}),
				});
			},
			{ env, uploadId: uploadRecord.id }
		);

		// Mark as completed
		await env.DB.prepare('UPDATE UPLOADS SET status = "completed" WHERE id = ?').bind(uploadRecord.id).run();
		await editTelegramMessage(
			env,
			chatId,
			messageId,
			`4️⃣ Upload completed!\n\n📁 ${uploadRecord.file_name}\n✅ Successfully uploaded to Google Drive`
		);
	} catch (error) {
		console.error('Process file upload error:', error);
		await env.DB.prepare('UPDATE UPLOADS SET status = "failed" WHERE id = ?').bind(uploadRecord.id).run();
		await editTelegramMessage(
			env,
			chatId,
			messageId,
			`❌ Upload failed!\n\nError: ${error.message}\n\nDebug Info:\nFile: ${uploadRecord.file_name}\nSize: ${(
				uploadRecord.total /
				(1024 * 1024)
			).toFixed(1)} MB\nTime: ${new Date().toLocaleString()}`
		);
	}
}

// Chunked upload function for large files using resumable download
async function uploadLargeFileChunked(env, uploadRecord, chatId, messageId) {
	try {
		const accessToken = await getAccessToken(uploadRecord.user_id, env);

		// Get file info from Telegram - handle any file size
		let downloadUrl, telegramFileName;
		try {
			const result = await getTelegramFileInfo(env.TELEGRAM_BOT_TOKEN, uploadRecord.file_id);
			downloadUrl = result.downloadUrl;
			telegramFileName = result.fileName;
		} catch (error) {
			// If getFile fails for large files, we cannot proceed
			console.log('getFile API failed for large file:', error.message);
			throw new Error(
				`Unable to process this large file (${uploadRecord.file_name}). Telegram's bot API has limitations on file access for files larger than 20MB. Please try with a smaller file or use a different upload method.`
			);
		}

		// Ensure folder GDUPLODER
		const folderId = await getOrCreateFolder('GDUPLODER', accessToken);

		// Use the resumable download approach for large files
		await uploadLargeFileToDriveWithProgress(env, accessToken, uploadRecord, downloadUrl, folderId, chatId, messageId);

		// Mark as completed
		await env.DB.prepare('UPDATE UPLOADS SET status = "completed" WHERE id = ?').bind(uploadRecord.id).run();
		await editTelegramMessage(
			env,
			chatId,
			messageId,
			`4️⃣ Upload completed!\n\n📁 ${uploadRecord.file_name}\n✅ Successfully uploaded to Google Drive (Resumable Upload)`
		);
	} catch (error) {
		console.error('Large file upload error:', error);
		await env.DB.prepare('UPDATE UPLOADS SET status = "failed" WHERE id = ?').bind(uploadRecord.id).run();
		await editTelegramMessage(
			env,
			chatId,
			messageId,
			`❌ Upload failed!\n\nError: ${error.message}\n\nDebug Info:\nFile: ${uploadRecord.file_name}\nSize: ${(
				uploadRecord.total /
				(1024 * 1024)
			).toFixed(1)} MB\nType: Large File\nTime: ${new Date().toLocaleString()}`
		);
	}
}
