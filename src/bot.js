// Telegram Bot Logic
// This file contains the Telegram bot functionality

export async function handleTelegramWebhook(update, env) {
	try {
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

			// Handle /help command
			if (text === '/help') {
				const helpText = `
🤖 WOWDrive Bot Commands:

/start - Start the bot
/help - Show this help message
/log_in - Link your Google Drive account
/log_out - Unlink your Google Drive account
/mygdrives - View your linked Google Drive accounts
/stats - View your Drive statistics
/account - View your account details
/privacy - View privacy policy and terms

📁 Features:
• Upload Telegram files to Google Drive
• Upload files from direct download links
• Multiple Google Drive account support
• Custom file naming
• File organization

Visit our website: https://bot.turksafar.ir
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

			// Handle /privacy command
			if (text === '/privacy') {
				const privacyText = `
🔒 Privacy Policy & Terms of Service

📋 Privacy Policy: https://bot.turksafar.ir/policy
📋 Terms of Service: https://bot.turksafar.ir/terms

For detailed information about how we handle your data and our terms of service, please visit our website.
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
		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('Error processing webhook:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}
