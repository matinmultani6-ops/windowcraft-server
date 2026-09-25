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
70.2*78.2 (2)
69.7.5*78.5

Do NOT write markdown, code blocks, or explanations. Only return lines of sizes.
`;

    // ⚡ STEP 1: Fast Dynamic Discovery (1.5s timeout ke saath)
    // Google ke server se puchho ki is samay sabse naya model kaunsa active hai
    let activeCandidateModels = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8 sec max

      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData.models)) {
          // Jo models generateContent support karte hain
          const validModels = listData.models
            .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''));

          // Sabse naye aur fastest models ko top priority dein (Gemini 2.5 > 2.0 > 1.5)
          const sortedModels = validModels.sort((a, b) => {
            const getScore = (name) => {
              if (name.includes('flash')) return 100;
              if (name.includes('pro')) return 50;
              return 10;
            };
            return getScore(b) - getScore(a);
          });

          if (sortedModels.length > 0) {
            activeCandidateModels = sortedModels.slice(0, 3); // Top 3 models
          }
        }
      }
    } catch (e) {
      // Timeout ya network glitch par standard modern fallbacks use karein
    }

    // Default High-Priority Modern Models (agar discovery miss ho)
    if (activeCandidateModels.length === 0) {
      activeCandidateModels = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-flash',
        'gemini-1.5-pro'
      ];
    }

    let cleanLines = '';
    let lastError = '';

    // ⚡ STEP 2: Top Active Model par call karein
    for (const model of activeCandidateModels) {
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
          break; // Mil gaya result! Agle loop ki zarurat nahi
        } else {
          lastError = data.error?.message || `Model ${model} responded with ${response.status}`;
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
