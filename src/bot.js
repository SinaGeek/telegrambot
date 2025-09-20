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
				const responseText = 'your Bot is Online';

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

				console.log('Telegram response status:', telegramResponse.status);

				if (telegramResponse.ok) {
					return new Response('OK', { status: 200 });
				} else {
					const errorText = await telegramResponse.text();
					console.error('Failed to send message to Telegram:', errorText);
					return new Response('Error sending message', { status: 500 });
				}
			}

			// Handle /help command
			if (text === '/help') {
				console.log('Handling /help command');

				const helpHtml = `
<b>🤖 WOWDrive Bot</b> — Upload from Telegram to <b>Google Drive</b>\n\n
<b>Quick actions</b>\n
• /login — Connect your Google Drive\n
• Send a <b>document/photo</b> — Uploads to your Drive\n
• /list — List your recent files\n
• /rename &lt;fileId&gt; &lt;newName&gt;\n
• /remove &lt;fileId&gt;\n
• /privacy — Privacy & Terms\n\n
Website: <a href="https://bot.turksafar.ir">bot.turksafar.ir</a>
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

				const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						text: helpHtml,
						parse_mode: 'HTML',
						reply_markup: replyMarkup,
					}),
				});

				if (telegramResponse.ok) {
					return new Response('OK', { status: 200 });
				} else {
					const err = await telegramResponse.text().catch(() => '');
					console.error('Failed to send help message to Telegram:', telegramResponse.status, err);
					return new Response('Error sending help message', { status: 500 });
				}
			}

			// New /login command - send direct Google OAuth consent URL
			if (text === '/login') {
				const clientId = env.GOOGLE_CLIENT_ID;
				const redirectUri = 'https://bot.turksafar.ir/googlesignin.html';
				const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
				const state = encodeURIComponent(userId);
				const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
					clientId
				)}&redirect_uri=${encodeURIComponent(
					redirectUri
				)}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;

				const replyMarkup = {
					inline_keyboard: [[{ text: '🔐 Sign in with Google', url: oauthUrl }]],
				};

				await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						text: 'Tap to connect your Google Drive:',
						reply_markup: replyMarkup,
					}),
				});
				return new Response('OK', { status: 200 });
			} else if (update.callback_query) {
				const cq = update.callback_query;
				const data = cq.data;
				const cqChatId = cq.message ? cq.message.chat.id : cq.from.id;

				if (data === 'show_login') {
					const userIdCb = (cq.from && cq.from.id ? cq.from.id : cqChatId).toString();
					const clientId = env.GOOGLE_CLIENT_ID;
					const redirectUri = 'https://bot.turksafar.ir/googlesignin.html';
					const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
					const state = encodeURIComponent(userIdCb);
					const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
						clientId
					)}&redirect_uri=${encodeURIComponent(
						redirectUri
					)}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;

					await sendTelegramMessage(env, cqChatId, `Tap to connect your Google Drive:\n${oauthUrl}`);
					await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ callback_query_id: cq.id }),
					});
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

						await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								callback_query_id: cq.id,
								text: `Upload cancelled: ${activeUpload.file_name}`,
								show_alert: true,
							}),
						});
					} else {
						await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								callback_query_id: cq.id,
								text: 'No active upload found',
								show_alert: true,
							}),
						});
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

						await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								callback_query_id: cq.id,
								text: progressText,
								show_alert: true,
							}),
						});
					} else {
						await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								callback_query_id: cq.id,
								text: 'No active upload found',
								show_alert: true,
							}),
						});
					}
					return new Response('OK', { status: 200 });
				}

				await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ callback_query_id: cq.id }),
				});
				return new Response('OK', { status: 200 });
			}

			// Handle file upload (if message has document or photo)
			if (message.document || message.photo) {
				try {
					const accessToken = await getAccessToken(userId, env);

					// Download file from Telegram (example for document; adapt for photo)
					const fileId = message.document ? message.document.file_id : message.photo[message.photo.length - 1].file_id;
					const fileInfo = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then((res) =>
						res.json()
					);
					const fileName = message.document ? message.document.file_name : 'photo.jpg';

					// Notify queued
					const queued = await sendTelegramMessageWithButtons(env, chatId, 'Request added to the queue!', [
						[
							{ text: '❌ Cancel', callback_data: 'cancel_upload' },
							{ text: '📈 View progress', callback_data: 'view_progress' },
						],
					]);
					const queuedMsg = await queued.json().catch(() => ({}));
					const progressChatId = chatId;
					const progressMessageId = queuedMsg?.result?.message_id;

					// Create upload record
					const uploadId = crypto.randomUUID();
					const total = fileContent.byteLength;
					await env.DB.prepare(
						'INSERT INTO UPLOADS (id, user_id, chat_id, message_id, file_name, total, uploaded, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
					)
						.bind(uploadId, userId, chatId, progressMessageId, fileName, total, 0, 'queued', Date.now(), Date.now())
						.run();

					// Fetch content buffer
					const fileContent = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`).then(
						(res) => res.arrayBuffer()
					);

					// Starting upload
					await editTelegramMessage(env, progressChatId, progressMessageId, 'Starting to upload...');
					await env.DB.prepare('UPDATE UPLOADS SET status = "uploading" WHERE id = ?').bind(uploadId).run();

					// Ensure folder GDUPLODER
					const folderId = await getOrCreateFolder('GDUPLODER', accessToken);

					// Resumable upload with progress
					const parents = [folderId];
					const sessionUrl = await startResumableSession(fileName, total, parents, accessToken);

					const start = Date.now();
					let lastEdit = 0;
					await uploadResumable(
						sessionUrl,
						fileContent,
						5 * 1024 * 1024, // 5MB chunks
						async ({ uploaded, total, startedAt }) => {
							// Update database with progress
							await env.DB.prepare('UPDATE UPLOADS SET uploaded = ?, updated_at = ? WHERE id = ?')
								.bind(uploaded, Date.now(), uploadId)
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
								b >= 1024 * 1024 * 1024 ? (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : (b / (1024 * 1024)).toFixed(1) + ' MB';
							const hhmmss = (s) => {
								const h = Math.floor(s / 3600);
								const m = Math.floor((s % 3600) / 60);
								const sec = s % 60;
								return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
							};
							const txt = `Uploading...\n${fileName}.\n\n${fmt(uploaded)} of ${fmt(total)} done.\n${bar} (${percent.toFixed(2)}%)\nSpeed ${(
								speed /
								(1024 * 1024)
							).toFixed(1)} MB/s\nElapsed Time: ${hhmmss(elapsedSec)}\nETA: ${hhmmss(
								etaSec
							)}\n\nProgress will be updated every 20s to get latest status use the button.\n\nYou are on free plan. You can only transfer at maximum 1MB/s. /upgrade to get better transfer speeds (upto 3.33 MB/s for this process and save 0:00:11 in waiting).`;
							await editTelegramMessage(env, progressChatId, progressMessageId, txt);
						},
						{ env, uploadId }
					);

					// Mark as completed
					await env.DB.prepare('UPDATE UPLOADS SET status = "completed" WHERE id = ?').bind(uploadId).run();
					await editTelegramMessage(env, progressChatId, progressMessageId, `Upload completed: ${fileName}`);
				} catch (error) {
					await sendTelegramMessage(env, chatId, `Error: ${error.message}. Use /login if needed.`);
				}
				return new Response('OK', { status: 200 });
			}

			// /list command (lists files)
			if (text === '/list') {
				try {
					const accessToken = await getAccessToken(userId, env);
					const files = await listDriveFiles(accessToken);
					const fileList = files.map((f) => `${f.name} (ID: ${f.id})`).join('\n') || 'No files found.';
					await sendTelegramMessage(env, chatId, `Your Drive files:\n${fileList}`);
				} catch (error) {
					await sendTelegramMessage(env, chatId, `Error: ${error.message}`);
				}
				return new Response('OK', { status: 200 });
			}

			// /stat command (show user and storage usage)
			if (text === '/stat') {
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
					)}\n\nTotal Storage Used in Trash: ${fmt(trash)}\n\nTotal Free storage: ${fmt(free)}\n\n${bar}\n(${pct.toFixed(
						2
					)}%) used of ${fmt(limit)}.`;
					await sendTelegramMessage(env, chatId, textStat);
				} catch (error) {
					await sendTelegramMessage(env, chatId, `Error: ${error.message}`);
				}
				return new Response('OK', { status: 200 });
			}

			// /rename <fileId> <newName>
			if (text.startsWith('/rename ')) {
				try {
					const [, fileId, newName] = text.split(' ');
					const accessToken = await getAccessToken(userId, env);
					await renameDriveFile(fileId, newName, accessToken);
					await sendTelegramMessage(env, chatId, `File renamed to ${newName}`);
				} catch (error) {
					await sendTelegramMessage(env, chatId, `Error: ${error.message}`);
				}
				return new Response('OK', { status: 200 });
			}

			// /remove <fileId>
			if (text.startsWith('/remove ')) {
				try {
					const [, fileId] = text.split(' ');
					const accessToken = await getAccessToken(userId, env);
					await deleteDriveFile(fileId, accessToken);
					await sendTelegramMessage(env, chatId, 'File removed successfully');
				} catch (error) {
					await sendTelegramMessage(env, chatId, `Error: ${error.message}`);
				}
				return new Response('OK', { status: 200 });
			}

			// Handle /privacy command
			if (text === '/privacy') {
				console.log('Handling /privacy command');
				const privacyText = `
🔒 Privacy Policy & Terms of Service

📋 Privacy Policy: https://bot.turksafar.ir/policy
📋 Terms of Service: https://bot.turksafar.ir/terms
				`;

				const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						chat_id: chatId,
						text: privacyText,
					}),
				});

				if (telegramResponse.ok) {
					return new Response('OK', { status: 200 });
				} else {
					console.error('Failed to send privacy message to Telegram');
					return new Response('Error sending privacy message', { status: 500 });
				}
			}
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
