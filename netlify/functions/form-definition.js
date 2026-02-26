const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300", // 5 min cache
};

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
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS };

    if (event.httpMethod !== "GET") {
        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    try {
        const projectKey = event.queryStringParameters?.project_key;
        if (!projectKey) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing project_key" }) };
        }

        const projectMap = JSON.parse(process.env.PROJECT_CONFIG || "{}");
        const config = projectMap[projectKey];

        if (!config) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Unknown project" }) };
        }

        const auth = getGoogleAuth();
        const doc = new GoogleSpreadsheet(config.sheetId, auth);
        await doc.loadInfo();

        // Look for a "FormDefinition" tab; fall back to second sheet
        const sheet = doc.sheetsByTitle['FormDefinition']
            || doc.sheetsByIndex[1];

        if (!sheet) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "No FormDefinition sheet found" }) };
        }

        const rows = await sheet.getRows();

        const fields = rows.map(row => {
            const field = {
                Field: row.get('Field'),
                Type: row.get('Type') || 'text',
                Label: row.get('Label') || row.get('Name'),
                Mandatory: (row.get('Mandatory') || '').toLowerCase() === 'true' ? "x" : "",
            };

            // Optional: placeholder text
            const placeholder = row.get('Placeholder');
            if (placeholder) field.Placeholder = placeholder;

            // Optional: comma-separated options for select/radio/checkbox
            const options = row.get('Options');
            if (options) field.Options = options.split(',').map(o => o.trim());

            // Optional: value
            const value = row.get('Value');
            if (value) field.Value = value;

            // Optional: extra
            const extra = row.get('Extra');
            if (extra) field.Extra = extra;


            // Optional: action
            const action = row.get('Action');
            if (action) field.Action = action;

            return field;
        });

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                project_key: projectKey,
                fields,
            }),
        };
    } catch (err) {
        console.error("form-definition error:", err);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
