export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY Vercel Environment Variables में नहीं मिली।' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageBase64, mimeType = 'image/jpeg' } = body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `
You are an expert Indian Aluminium Window Fabrication Assistant.
Analyze this image which contains handwritten window drawings/sketches, diary notes, or measurement lists.

TASK:
Extract EVERY single window measurement from the image without skipping any.

RULES:
1. Each drawn rectangle/box represents a window.
2. The number at the top or bottom edge of the box is the WIDTH (W).
3. The number at the left or right edge of the box is the HEIGHT (H).
4. If a fraction like '1/2' or '½' is present after a number (e.g. '69.7 ½'), represent half-sut as '.5'. For example:
   - '69.7 ½' -> '69.7.5'
   - '36.5 ½' -> '36.5.5'
   - '81.6' -> '81.6'
   - '81' -> '81'
5. If quantity is specified like '(4)', include '(4)'. If not, default to 1 (no brackets).

OUTPUT FORMAT:
Return ONLY the window sizes, ONE WINDOW PER LINE, in this exact format:
WIDTH*HEIGHT (QTY)
or
WIDTH*HEIGHT

Example Output:
46.3*78.1
70.2*78.2
69.7.5*78.5
69.6*78.5.5
36.5.5*78.5

Do NOT write markdown, code blocks, or explanations. Only return lines of sizes.
`;

    // ⚡ Google ke naye models (Gemini 3.8 Flash ko sabse pehle rakha hai)
    const modelsToTry = [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b'
    ];

    let cleanLines = '';
    let lastError = '';

    for (const model of modelsToTry) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: cleanBase64
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048
            }
          })
        });

        const data = await response.json();

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const rawResult = data.candidates[0].content.parts[0].text;
          cleanLines = rawResult
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('```'))
            .join('\n');
          break; // सफलता! काम हो गया, लूप रोकें
        } else {
          lastError = data.error?.message || `Model ${model} status ${response.status}`;
          console.warn(`Model ${model} failed, trying next model...`);
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (cleanLines) {
      return res.status(200).json({ success: true, result: cleanLines });
    } else {
      return res.status(400).json({ error: lastError || 'फोटो में कोई विंडो नाप नहीं मिल सका।' });
    }

  } catch (error) {
    console.error('Scan Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
