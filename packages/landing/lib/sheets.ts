import { google } from 'googleapis';
import type { Lead } from './mailer';

type SheetsEnv = {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
};

function readEnv(): SheetsEnv | null {
  const spreadsheetId = process.env.LANDING_GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.LANDING_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.LANDING_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    spreadsheetId,
    clientEmail,
    // Vercel stores multiline values as literal \n — unescape them.
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

export async function appendLeadToSheet(lead: Lead): Promise<void> {
  const env = readEnv();

  if (!env) {
    console.warn('[landing/sheets] Google Sheets env vars not set — skipping sheet append');
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: env.clientEmail, private_key: env.privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    new Date().toISOString(),
    lead.name,
    lead.email,
    lead.website || '',
    lead.companyUrl || '',
    lead.useCase || '',
    lead.message || '',
    lead.source || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.spreadsheetId,
    range: 'Sheet1!A:H',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
