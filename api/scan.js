export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY Vercel par set nahi hai.' });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `
You are an expert Indian Aluminium Window Fabrication Assistant.
Analyze this image which contains handwritten window drawings/sketches, diary notes, or measurement lists.

TASK:
Extract EVERY single window measurement from the image without skipping any.

RULES FOR DRAWINGS / SKETCHES:
1. Each drawn rectangle/box represents a window.
2. The number inside the circle (e.g. ①, ②, 1, 2) is the window number/ID.
3. The number at the top or bottom edge of the box is the WIDTH (W).
4. The number at the left or right edge of the box is the HEIGHT (H).
5. If any number is crossed out or scribbled over, take the corrected/overwritten number.
6. If a fraction like '1/2' or '½' is present after a number (e.g. '69.7 ½'), represent half-sut as '.5'. For example:
   - '69.7 ½' -> '69.7.5'
   - '36.5 ½' -> '36.5.5'
   - '81.6' -> '81.6'
   - '81' -> '81'
   - '46.3' -> '46.3'
7. If quantity is specified like '(4)' or '4 piece', include '(4)'. If not specified, default to 1 piece (no brackets needed).
8. If plain text list or table is present without boxes, extract Width and Height in the same way.

OUTPUT FORMAT:
Return ONLY the window sizes, ONE WINDOW PER LINE, in this exact format:
WIDTH*HEIGHT (QTY)
or
WIDTH*HEIGHT

Example Output:
46.3*78.1
70.2*78.2
69.7.5*78.5
57.4.5*45.1.5
81*94

Do NOT write any explanation, markdown backticks, or intro. Output ONLY the lines of measurements.
`;

    // STEP 1: Google se pucho ki is API key ke liye kaunse models active hain
    let targetModels = [];
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData.models)) {
          const contentModels = listData.models.filter(m => 
            Array.isArray(m.supportedGenerationMethods) && 
            m.supportedGenerationMethods.includes('generateContent')
          );
          const flashModels = contentModels.filter(m => m.name.toLowerCase().includes('flash'));
          const otherModels = contentModels.filter(m => !m.name.toLowerCase().includes('flash'));
          targetModels = [...flashModels, ...otherModels].map(m => m.name);
        }
      }
    } catch (e) {
      console.warn("Model discovery error:", e);
    }

    // Fallback list agar discovery na chale
    if (targetModels.length === 0) {
      targetModels = [
        'models/gemini-2.0-flash',
        'models/gemini-2.5-flash',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-pro'
      ];
    }

    let lastError = null;
    let cleanLines = '';

    // STEP 2: Jo model Google ne diya, seedha usi se scan karo
    for (const modelPath of targetModels) {
      const cleanPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${cleanPath}:generateContent?key=${apiKey}`;

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
                    inline_data: {
                      mime_type: mimeType,
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
          break; // Success! Working model mil gaya
        } else {
          lastError = data.error?.message || `Model ${modelPath} failed`;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (cleanLines) {
      return res.status(200).json({ success: true, result: cleanLines });
    } else {
      return res.status(500).json({ error: lastError || 'Gemini API call failed' });
    }
  } catch (error) {
    console.error('Scan Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
