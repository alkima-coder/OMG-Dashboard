import { google } from 'googleapis';
import { NextResponse } from 'next/server';

function cleanPidStr(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!str || str === '-') return str;
  if (/[eE]\+?\d+/.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // fallback
    }
  }
  str = str.replace(/\.0+$/, '');
  return str;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, sheetName, username, password } = body;

    // --- 1. SECURE BACKEND LOGIN (Role-Based Access: Planner vs Viewer) ---
    if (action === 'login') {
      const validPlannerUser = process.env.PLANNER_USERNAME || 'phdplanner';
      const validPlannerPass = process.env.PLANNER_PASSWORD || 'phd123';
      const validViewerUser = process.env.ADMIN_USERNAME || 'phd';
      const validViewerPass = process.env.ADMIN_PASSWORD || 'phd123';

      if (typeof username === 'string' && typeof password === 'string') {
        const u = username.trim();
        const p = password.trim();

        if (u === validPlannerUser && p === validPlannerPass) {
          return NextResponse.json({ success: true, role: 'planner', username: u });
        }
        if (u === validViewerUser && p === validViewerPass) {
          return NextResponse.json({ success: true, role: 'viewer', username: u });
        }
      }
      return NextResponse.json({ success: false, error: "Incorrect username or password." });
    }

    // --- 2. DATA ENGINE ---
    if (action === 'getData') {
      const allowedSheets = [
        "Media API",
        "Commerce",
        "Creative Raw",
        "Creative Report",
        "Media Signal",
        "CIR DAILY",
        "PID CATEGORY",
        "PID SALES",
        "PID CID",
        "Adjustment Logs",
        "Push Rank",
        "AI_Creative_Learnings"
      ];
      
      if (!allowedSheets.includes(sheetName)) {
        return NextResponse.json({ error: `Unauthorized or invalid sheet name: ${sheetName}` }, { status: 400 });
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID, 
        range: sheetName === "Creative Report" ? `${sheetName}!A1:Z` : `${sheetName}!A1:ZZ`,
      });

      const data = response.data.values;
      if (!data || data.length === 0) {
        return NextResponse.json({ success: true, headers: [], data: [], sheetName });
      }

      if (data.length === 1) {
        // Hanya header tanpa baris data
        const headers = data[0].map(h => String(h).trim());
        return NextResponse.json({ success: true, headers, data: [], sheetName });
      }

      const headers = data[0].map(h => String(h).trim());

      // Compact dictionary-encoded response for "Creative Report" (55k+ daily rows -> ~1.3MB JSON)
      if (sheetName === "Creative Report") {
        const parseSheetNum = (val: any): number => {
          if (typeof val === 'number') return val;
          if (!val) return 0;
          const n = Number(String(val).replace(/[^0-9.-]+/g, ''));
          return isNaN(n) ? 0 : Math.round(n * 100) / 100;
        };

        const findCol = (candidates: string[], fallbackIdx: number): number => {
          const idx = headers.findIndex(h => candidates.some(c => c.toLowerCase() === h.toLowerCase().trim()));
          return idx !== -1 ? idx : fallbackIdx;
        };

        const idxDate = findCol(['Date'], 0);
        const idxBrand = findCol(['Brand', 'Brand fx'], 1);
        const idxPlat = findCol(['Platform'], 2);
        const idxAdType = findCol(['Ad Type', 'Ad type'], 3);
        const idxKpi = findCol(['KPI', 'Funnel'], 4);
        const idxFormat = findCol(['Format'], 5);
        const idxAdGroup = findCol(['Ad Group', 'Ad group'], 6);
        const idxPillar = findCol(['Pillar', 'Content Pillar'], 7);
        const idxCreative = findCol(['Creative Name', 'Ad Name'], 8);
        const idxLink = findCol(['Creative Link', 'Social Link', 'Link'], 9);
        const idxSpend = findCol(['Spend', 'Ad Spend', 'Cost'], 10);
        const idxImp = findCol(['Impression', 'Impressions'], 11);
        const idxClicks = findCol(['Clicks', 'Combined Clicks'], 12);
        const idxV6 = findCol(['6s View', 'Views 6s'], 13);
        const idxV15 = findCol(['15s View', 'Views 15s', 'Views'], 14);
        const idxPurchase = findCol(['Purchase', 'Purchases', 'Orders'], 15);
        const idxGmv = findCol(['GMV', 'Sales', 'Revenue'], 16);
        const idxEngagement = findCol(['Engagement', 'Engagements', 'Post Engagement'], 17);

        const strMap = new Map<string, number>();
        const strings: string[] = [];
        const getStrIdx = (s: string): number => {
          const clean = (s || '').trim();
          let idx = strMap.get(clean);
          if (idx === undefined) {
            idx = strings.length;
            strings.push(clean);
            strMap.set(clean, idx);
          }
          return idx;
        };

        // First pass: find best non-empty Creative Link for each (Brand, Platform, Ad Group, Creative Name)
        const linkFallbackMap = new Map<string, string>();
        for (let i = 1; i < data.length; i++) {
          const r = data[i];
          if (!r || !r[idxDate]) continue;
          const rawLink = String(r[idxLink] || '').trim();
          if (rawLink && rawLink !== '-' && rawLink.toUpperCase() !== '#N/A' && rawLink.toUpperCase() !== 'N/A') {
            const cKey = `${(r[idxBrand] || '').trim()}||${(r[idxPlat] || '').trim()}||${(r[idxAdGroup] || '').trim()}||${(r[idxCreative] || '').trim()}`;
            if (!linkFallbackMap.has(cKey)) {
              linkFallbackMap.set(cKey, rawLink);
            }
          }
        }

        // Second pass: group by unique creative dimension tuple + daily metric array
        const creativeGroups = new Map<string, { dims: number[]; days: Map<number, [number, number, number, number, number, number, number, number]> }>();

        for (let i = 1; i < data.length; i++) {
          const r = data[i];
          if (!r || !r[idxDate]) continue;
          const dtStr = String(r[idxDate] || '').trim();
          if (!dtStr) continue;

          const spend = parseSheetNum(r[idxSpend]);
          const imp = parseSheetNum(r[idxImp]);
          const clicks = parseSheetNum(r[idxClicks]);
          const v6 = parseSheetNum(r[idxV6]);
          const v15 = parseSheetNum(r[idxV15]);
          const purchase = parseSheetNum(r[idxPurchase]);
          const gmv = parseSheetNum(r[idxGmv]);
          const engagement = parseSheetNum(r[idxEngagement]);

          if (spend === 0 && imp === 0 && clicks === 0 && v6 === 0 && v15 === 0 && purchase === 0 && gmv === 0 && engagement === 0) continue;

          const b = String(r[idxBrand] || '').trim();
          const p = String(r[idxPlat] || '').trim();
          const at = String(r[idxAdType] || '').trim();
          const kpi = String(r[idxKpi] || '').trim();
          const fmt = String(r[idxFormat] || '').trim();
          const ag = String(r[idxAdGroup] || '').trim();
          const pil = idxPillar >= 0 ? String(r[idxPillar] || '').trim() : '';
          const cn = String(r[idxCreative] || '').trim();
          let cl = String(r[idxLink] || '').trim();
          if (!cl || cl === '-' || cl.toUpperCase() === '#N/A' || cl.toUpperCase() === 'N/A') {
            cl = linkFallbackMap.get(`${b}||${p}||${ag}||${cn}`) || '';
          }

          const groupKey = `${b}||${p}||${at}||${kpi}||${fmt}||${ag}||${pil}||${cn}`;
          let grp = creativeGroups.get(groupKey);
          if (!grp) {
            grp = {
              dims: [
                getStrIdx(b),
                getStrIdx(p),
                getStrIdx(at),
                getStrIdx(kpi),
                getStrIdx(fmt),
                getStrIdx(ag),
                getStrIdx(cn),
                getStrIdx(cl),
                getStrIdx(pil),
              ],
              days: new Map(),
            };
            creativeGroups.set(groupKey, grp);
          } else if (strings[grp.dims[7]] === '' && cl) {
            grp.dims[7] = getStrIdx(cl);
          }

          const dtIdx = getStrIdx(dtStr);
          const existingDay = grp.days.get(dtIdx);
          if (!existingDay) {
            grp.days.set(dtIdx, [spend, imp, clicks, v6, v15, purchase, gmv, engagement]);
          } else {
            // Take the highest row data if there is a duplicate row on the same date
            if (
              spend > existingDay[0] ||
              (spend === existingDay[0] && gmv > existingDay[6]) ||
              (spend === existingDay[0] && imp > existingDay[1])
            ) {
              grp.days.set(dtIdx, [spend, imp, clicks, v6, v15, purchase, gmv, engagement]);
            }
          }
        }

        const groups = Array.from(creativeGroups.values()).map(g => [
          g.dims,
          Array.from(g.days.entries()).map(([dIdx, m]) => [dIdx, m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]])
        ]);

        return NextResponse.json({
          success: true,
          headers,
          compactCreativeReport: { strings, groups },
          sheetName,
        });
      }

      // Mengubah format Array menjadi Array of Objects
      const formattedData = data.slice(1).map(row => {
        let obj: Record<string, any> = {};
        headers.forEach((header, index) => {
          let val = row[index] !== undefined ? row[index] : "";
          const upperHeader = header.toUpperCase();
          if (upperHeader.includes('PID') || upperHeader === 'CID' || upperHeader === 'SKU ID') {
            val = cleanPidStr(val);
          }
          obj[header] = val;
        });
        return obj;
      });

      return NextResponse.json({ success: true, headers, data: formattedData, sheetName });
    }

    // --- 3. ADD ADJUSTMENT LOG ---
    if (action === 'addAdjustment') {
      const { date, pid, skuName, metric, adjustment, userName } = body;
      if (!pid || !adjustment) {
        return NextResponse.json({ error: "Missing required fields (pid or adjustment)." }, { status: 400 });
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const id = `ADJ-${Date.now()}`;
      const now = new Date().toISOString();
      const cleanedPid = cleanPidStr(pid);
      const newRow = [
        id,
        date || "",
        `'${cleanedPid}`, // Prefix with single quote so Google Sheets treats as text string
        skuName || "",
        metric || "General",
        adjustment,
        "Pending",
        userName || "User",
        now,
        "",
        "",
        body.actionTaken || ""
      ];

      // Ensure header L1 has 'Action Taken' if not present
      try {
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'Adjustment Logs!L1',
        });
        if (!headerRes.data.values || !headerRes.data.values[0] || !headerRes.data.values[0][0]) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Adjustment Logs!L1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Action Taken']] },
          });
        }
      } catch (e) {
        console.warn('Could not verify header L1:', e);
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Adjustment Logs!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [newRow],
        },
      });

      return NextResponse.json({
        success: true,
        adjustment: {
          id,
          date: date || "",
          pid: cleanedPid,
          skuName: skuName || "",
          metric: metric || "General",
          adjustment,
          status: "Pending",
          createdBy: userName || "User",
          createdAt: now,
          updatedAt: "",
          updatedBy: "",
          actionTaken: body.actionTaken || ""
        }
      });
    }

    // --- 4. UPDATE ADJUSTMENT STATUS ---
    if (action === 'updateAdjustmentStatus') {
      const { id, status, userName } = body;
      if (!id || !status) {
        return NextResponse.json({ error: "Missing id or status." }, { status: 400 });
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Adjustment Logs!A:L',
      });
      const rows = getRes.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === id);
      if (rowIndex === -1) {
        return NextResponse.json({ error: `Adjustment with ID ${id} not found.` }, { status: 404 });
      }

      const sheetRowNum = rowIndex + 1;
      const now = new Date().toISOString();

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `Adjustment Logs!G${sheetRowNum}:K${sheetRowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            status,
            rows[rowIndex][7] || "", // Created By
            rows[rowIndex][8] || "", // Created At
            now,                     // Updated At
            userName || "User"       // Updated By
          ]],
        },
      });

      return NextResponse.json({
        success: true,
        id,
        status,
        updatedAt: now,
        updatedBy: userName || "User"
      });
    }

    // --- 5. UPDATE ACTION TAKEN ---
    if (action === 'updateActionTaken') {
      const { id, actionTaken, userName } = body;
      if (!id) {
        return NextResponse.json({ error: "Missing adjustment ID." }, { status: 400 });
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Adjustment Logs!A:L',
      });
      const rows = getRes.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === id);
      if (rowIndex === -1) {
        return NextResponse.json({ error: `Adjustment with ID ${id} not found.` }, { status: 404 });
      }

      const sheetRowNum = rowIndex + 1;
      const now = new Date().toISOString();

      // Ensure header L1 has 'Action Taken' if empty
      if (!rows[0] || !rows[0][11]) {
        try {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Adjustment Logs!L1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Action Taken']] },
          });
        } catch (e) {
          console.warn('Could not set header L1:', e);
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `Adjustment Logs!J${sheetRowNum}:L${sheetRowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            now,                     // Updated At (Col J)
            userName || "User",      // Updated By (Col K)
            actionTaken || ""        // Action Taken (Col L)
          ]],
        },
      });

      return NextResponse.json({
        success: true,
        id,
        actionTaken: actionTaken || "",
        updatedAt: now,
        updatedBy: userName || "User"
      });
    }

    return NextResponse.json({ error: "Invalid action request." }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}