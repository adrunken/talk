const https = require('https');
const http = require('http');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'deepseek-coder:6.7b';

const SYSTEM_INSTRUCTION = `You are an expert web engineer.
You are modifying an existing website.
Preserve all unrelated code and functionality.
Apply ONLY the requested changes.
Return a complete, valid HTML document.
Do not explain.
Do not use markdown.
Do not add comments outside code.`;

async function queryOllama(currentCode, userRequest) {
  return new Promise((resolve, reject) => {
    const payload = {
      model: MODEL,
      prompt: `Current HTML:\n\n${currentCode}\n\nUser Request: ${userRequest}`,
      system: SYSTEM_INSTRUCTION,
      stream: false,
      temperature: 0.3,
      top_p: 0.9,
    };

    const url = new URL(OLLAMA_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.response) {
            resolve(response.response.trim());
          } else {
            reject(new Error('No response from Ollama'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Ollama response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

module.exports = { queryOllama };
