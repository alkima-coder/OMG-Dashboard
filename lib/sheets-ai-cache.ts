import { google, sheets_v4 } from 'googleapis';

export const AI_LEARNINGS_SHEET_NAME = 'AI_Creative_Learnings';

export const AI_LEARNINGS_HEADERS = [
  'cohort_id',
  'creative_signature_hash',
  'brand',
  'ad_type',
  'week_key',
  'analyzed_at',
  'classified_creatives_json',
  'ai_report_markdown',
] as const;

export interface CachedCreativeLearningRow {
  rowIndex: number; // 1-based row number in Google Sheets
  cohort_id: string;
  creative_signature_hash: string;
  brand: string;
  ad_type: string;
  week_key: string;
  analyzed_at: string;
  classified_creatives_json: string;
  ai_report_markdown: string;
}

function getSheetsClient(): { sheets: sheets_v4.Sheets; spreadsheetId: string } {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID environment variable is not configured.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

/**
 * Ensures the `AI_Creative_Learnings` tab exists in the Google Spreadsheet with the required 8 headers.
 */
export async function ensureAiLearningsSheetExists(): Promise<void> {
  const { sheets, spreadsheetId } = getSheetsClient();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${AI_LEARNINGS_SHEET_NAME}!A1:H1`,
    });

    const firstRow = res.data.values?.[0];
    if (!firstRow || firstRow.length < AI_LEARNINGS_HEADERS.length || firstRow[0] !== 'cohort_id') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${AI_LEARNINGS_SHEET_NAME}!A1:H1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [Array.from(AI_LEARNINGS_HEADERS)],
        },
      });
    }
    return;
  } catch (err: any) {
    const msg = String(err?.message || '');
    // If tab does not exist yet, create it via batchUpdate
    if (msg.includes('Unable to parse range') || msg.includes('not found') || err?.code === 400) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: AI_LEARNINGS_SHEET_NAME,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 10,
                      frozenRowCount: 1,
                    },
                  },
                },
              },
            ],
          },
        });
      } catch (addErr: any) {
        // Ignore if another concurrent request just created the sheet
        if (!String(addErr?.message || '').includes('already exists')) {
          throw addErr;
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${AI_LEARNINGS_SHEET_NAME}!A1:H1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [Array.from(AI_LEARNINGS_HEADERS)],
        },
      });
      return;
    }
    throw err;
  }
}

/**
 * Reads all cached rows from `AI_Creative_Learnings`.
 */
export async function getAllCachedCreativeLearnings(): Promise<CachedCreativeLearningRow[]> {
  await ensureAiLearningsSheetExists();
  const { sheets, spreadsheetId } = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${AI_LEARNINGS_SHEET_NAME}!A1:H`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const result: CachedCreativeLearningRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    result.push({
      rowIndex: i + 1,
      cohort_id: String(r[0] || '').trim(),
      creative_signature_hash: String(r[1] || '').trim(),
      brand: String(r[2] || '').trim(),
      ad_type: String(r[3] || '').trim(),
      week_key: String(r[4] || '').trim(),
      analyzed_at: String(r[5] || '').trim(),
      classified_creatives_json: String(r[6] || '[]'),
      ai_report_markdown: String(r[7] || ''),
    });
  }

  return result;
}

/**
 * Finds a cached cohort entry by `cohort_id` (or latest matching brand + ad_type + week_key).
 */
export async function getCachedLearningByCohort(
  cohortId: string
): Promise<CachedCreativeLearningRow | null> {
  const all = await getAllCachedCreativeLearnings();
  const normTarget = cohortId.trim().toUpperCase();
  const matches = all.filter(r => r.cohort_id.toUpperCase() === normTarget);
  if (matches.length === 0) return null;
  // Return most recently analyzed if multiple exist
  return matches[matches.length - 1];
}

/**
 * Safely truncates a string so it never exceeds Google Sheets' 50,000 character per-cell limit.
 */
function safeCellString(str: string, maxChars = 48000): string {
  if (!str) return '';
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars);
}

/**
 * Inserts or updates a row in `AI_Creative_Learnings` for a given cohort.
 */
export async function upsertCachedCreativeLearning(
  payload: Omit<CachedCreativeLearningRow, 'rowIndex'>
): Promise<CachedCreativeLearningRow> {
  await ensureAiLearningsSheetExists();
  const { sheets, spreadsheetId } = getSheetsClient();

  const existing = await getCachedLearningByCohort(payload.cohort_id);
  const valuesRow = [
    payload.cohort_id,
    payload.creative_signature_hash,
    payload.brand,
    payload.ad_type,
    payload.week_key,
    payload.analyzed_at,
    safeCellString(payload.classified_creatives_json, 47000),
    safeCellString(payload.ai_report_markdown, 47000),
  ];

  if (existing && existing.rowIndex >= 2) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${AI_LEARNINGS_SHEET_NAME}!A${existing.rowIndex}:H${existing.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [valuesRow],
      },
    });
    return {
      ...payload,
      rowIndex: existing.rowIndex,
    };
  } else {
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${AI_LEARNINGS_SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [valuesRow],
      },
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const matchRow = updatedRange.match(/!A(\d+):/);
    const rowIndex = matchRow ? parseInt(matchRow[1], 10) : 2;

    return {
      ...payload,
      rowIndex,
    };
  }
}

