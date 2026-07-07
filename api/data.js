// api/data.js
export default async function handler(req, res) {
  const passcode = req.headers['x-passcode'];
  
  // Read valid passcodes from Vercel Environment Variables, fallback to defaults
  const envPasscodes = process.env.VALID_PASSCODES;
  const validPasscodes = envPasscodes 
    ? envPasscodes.split(",").map(p => p.trim()) 
    : ["Pehchaan@2026", "Pehchan@2026"];
  
  if (!validPasscodes.includes(passcode)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Read Google Sheet ID from Vercel Environment Variables, fallback to default
    const SHEET_ID = process.env.SHEET_ID || "1pwUb9tNTzqGO2utAzF-oLRNiCsENK596Mj-ff8etGzA";
    const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
    
    const bust = req.query.bust === 'true';
    const url = bust ? `${SHEET_CSV}&_=${Date.now()}` : SHEET_CSV;
    
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).json({ error: `Failed to fetch from Google Sheets: HTTP ${response.status}` });
    }
    
    const csvData = await response.text();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).send(csvData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
