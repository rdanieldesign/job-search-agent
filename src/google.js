// src/google.js
// Shared Google API client — used by gmail.js, calendar.js, and sheets.js

import { google } from 'googleapis';
import 'dotenv/config';

function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // Auto-refresh tokens when they expire
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      console.log('[Auth] New refresh token received — update GOOGLE_REFRESH_TOKEN in .env');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    }
    console.log('[Auth] Access token refreshed automatically');
  });

  return oauth2Client;
}

export const auth = getAuthClient();
export const gmail = google.gmail({ version: 'v1', auth });
export const calendar = google.calendar({ version: 'v3', auth });
export const sheets = google.sheets({ version: 'v4', auth });
