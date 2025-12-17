const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Latest production model, excellent for code

const SYSTEM_INSTRUCTION = `You are an expert web engineer.
You are modifying an existing website.
Preserve all unrelated code and functionality.
Apply ONLY the requested changes.
Return a complete, valid HTML document.
Do not explain.
Do not use markdown.
Do not add comments outside code.`;

async function queryOllama(currentCode, userRequest) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable is not set. Get one free from https://console.groq.com');
  }

  return new Promise((resolve, reject) => {
    const payload = {
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: SYSTEM_INSTRUCTION
        },
        {
          role: 'user',
          content: `Current HTML:\n\n${currentCode}\n\nUser Request: ${userRequest}`
        }
      ],
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 8000,
      stream: false
    };

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.error) {
            reject(new Error(`Groq API error: ${response.error.message}`));
            return;
          }

          if (response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content.trim();
            resolve(content);
          } else {
            reject(new Error('No response from Groq API'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Groq response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

module.exports = { queryOllama };
