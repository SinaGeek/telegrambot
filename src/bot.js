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
🤖 WOWDrive Bot Commands:

/start - Start the bot
/help - Show this help message
/privacy - View privacy policy and terms

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
