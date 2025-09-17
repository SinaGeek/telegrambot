import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

/**
 * Uploads a file to Google Drive.
 * @return {Promise<string|null|undefined>} The ID of the uploaded file.
 */
async function uploadBasic() {
	// Authenticate with Google and get an authorized client.
	// TODO (developer): Use an appropriate auth mechanism for your app.
	const auth = new GoogleAuth({
		scopes: 'https://www.googleapis.com/auth/drive',
	});

	// Create a new Drive API client (v3).
	const service = google.drive({ version: 'v3', auth });

	// The request body for the file to be uploaded.
	const requestBody = {
		name: 'photo.jpg',
		fields: 'id',
	};

	// The media content to be uploaded.
	const media = {
		mimeType: 'image/jpeg',
		body: fs.createReadStream('files/photo.jpg'),
	};

	// Upload the file.
	const file = await service.files.create({
		requestBody,
		media,
	});

	// Print the ID of the uploaded file.
	console.log('File Id:', file.data.id);
	return file.data.id;
}
