const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');
const axios = require('axios');

const resend = new Resend(process.env.RESEND_API_KEY);

function getGoogleAuth() {
  const base64Key = process.env.GOOGLE_PRIVATE_KEY;
  const decodedKey = Buffer.from(base64Key, 'base64').toString('utf-8');
  const finalKey = decodedKey.replace(/\\n/g, '\n');
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: finalKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

  try {
    let data;

    const contentType = event.headers['content-type'] || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(event.body);
      data = Object.fromEntries(params.entries());
    } else {
      data = JSON.parse(event.body).data;
    }

    console.log("Received data:", data);

    const projectMap = JSON.parse(process.env.PROJECT_CONFIG || "{}");
    const config = projectMap[data.project_key];

    if (!config) throw new Error("Invalid Project Key");

    // 1. CAPTCHA CHECK
    const turnstile = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      `secret=${process.env.TURNSTILE_SECRET}&response=${data['cf-turnstile-response']}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (!turnstile.data.success) throw new Error("Captcha failed");

    // 2. GOOGLE SHEETS — dynamically map fields from the FormDefinition tab
    const auth = getGoogleAuth();
    const doc = new GoogleSpreadsheet(config.sheetId, auth);
    await doc.loadInfo();

    // Read field names from FormDefinition tab
    const defSheet = doc.sheetsByTitle['FormDefinition'] || doc.sheetsByIndex[1];
    const defRows = defSheet ? await defSheet.getRows() : [];
    const fieldNames = defRows.map(row => row.get('Field')).filter(Boolean);

    // Build a row object dynamically: Date + all defined fields
    const rowData = { Date: new Date().toISOString() };
    for (const name of fieldNames) {
      rowData[name] = data[name] || "";
    }

    await doc.sheetsByIndex[0].addRow(rowData);

    // 3. EMAIL — build body from all submitted fields
    const emailSubject = data.name
      ? `New Lead: ${data.name}`
      : `New form submission (${data.project_key})`;

    const emailHtml = fieldNames
      .map(name => `<p><strong>${name}:</strong> ${data[name] || ""}</p>`)
      .join('');

    await resend.emails.send({
      from: 'Webformular <onboarding@resend.dev>',
      to: config.emailTo,
      subject: emailSubject,
      html: emailHtml,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ status: "success" }) };
  } catch (err) {
    console.error("submit error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};