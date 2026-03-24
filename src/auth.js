// src/auth.js
// Run this ONCE to authenticate with Google and generate your OAuth tokens.
// Usage: node src/auth.js
// It will print an access token and refresh token — paste them into your .env file.

import { google } from 'googleapis';
import * as readline from 'readline';
import 'dotenv/config';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // force refresh token to be returned
});

console.log('\n========================================');
console.log('STEP 1: Open this URL in your browser:');
console.log('========================================\n');
console.log(authUrl);
console.log('\n========================================');
console.log('STEP 2: Paste the authorization code below');
console.log('========================================\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Authorization code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n========================================');
    console.log('SUCCESS — Add these to your .env file:');
    console.log('========================================\n');
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nDone! Add these tokens to your .env (local) and GitHub Actions secrets.');
  } catch (err) {
    console.error('Error getting tokens:', err.message);
  }
});
