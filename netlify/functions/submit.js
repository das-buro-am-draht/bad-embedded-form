const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');
const axios = require('axios');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };
  
  try {
    const data = JSON.parse(event.body);
    console.log("Received data:", data);
    
    // Parse the JSON config from your Env Var
    const projectMap = JSON.parse(process.env.PROJECT_CONFIG || "{}");
    console.log("parsed project confif:", projectMap);
    const config = projectMap[data.project_key];

    if (!config) throw new Error("Invalid Project Key");

    // 1. CAPTCHA CHECK
    const turnstile = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      `secret=${process.env.TURNSTILE_SECRET}&response=${data['cf-turnstile-response']}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (!turnstile.data.success) throw new Error("Captcha failed");

    // 2. GOOGLE SHEETS
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.sheetId, auth);
    await doc.loadInfo();
    await doc.sheetsByIndex[0].addRow({
      Date: new Date().toISOString(),
      Name: data.name,
      Email: data.email,
      Message: data.message || ""
    });

    // 3. EMAIL
    await resend.emails.send({
      from: 'Forms <onboarding@resend.dev>',
      to: config.emailTo,
      subject: `New Lead: ${data.name}`,
      html: `<p><strong>Name:</strong> ${data.name}</p><p><strong>Email:</strong> ${data.email}</p>`
    });

    return { statusCode: 200, headers, body: JSON.stringify({ status: "success" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};