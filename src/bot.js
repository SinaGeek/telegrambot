import { getAccessToken, uploadFileToDrive, listDriveFiles, renameDriveFile, deleteDriveFile } from './drive.js';

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
				const helpText = `
🤖 WOWDrive Bot — Google Drive from Telegram

/start — Check bot status
/help — Show this help
/login — Connect your Google Drive (opens sign-in link)

Send a file (document/photo) — Uploads directly to your Drive
/list — List your recent Drive files (IDs included)
/rename <fileId> <newName> — Rename a Drive file
/remove <fileId> — Delete a Drive file
/privacy — View privacy policy and terms

Website: https://bot.turksafar.ir
				`;

				const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						chat_id: chatId,
						text: helpText,
					}),
				});

				if (telegramResponse.ok) {
					return new Response('OK', { status: 200 });
				} else {
					console.error('Failed to send help message to Telegram');
					return new Response('Error sending help message', { status: 500 });
				}
			}

			// New /login command
			if (text === '/login') {
				const signInUrl = `https://bot.turksafar.ir/GoogleSignIn.html?userId=${userId}`;
				await sendTelegramMessage(env, chatId, `Please sign in to Google Drive: ${signInUrl}`);
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
					const fileContent = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`).then(
						(res) => res.arrayBuffer()
					);

					const fileName = message.document ? message.document.file_name : 'photo.jpg';
					const uploadedFile = await uploadFileToDrive(fileName, fileContent, accessToken);

					await sendTelegramMessage(env, chatId, `File uploaded successfully! ID: ${uploadedFile.id}`);
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
