const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cors = require('cors');
const { queryOllama } = require('./ollama');
const { commitFileToGitHub } = require('./github');
const { validateHTMLOutput } = require('./validation');

const app = express();
const PORT = process.env.PORT || 12000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const SITE_DIR = path.join(__dirname, '..', 'site');
const LIVE_FILE = path.join(SITE_DIR, 'live.html');
const PREVIEW_FILE = path.join(SITE_DIR, 'preview.html');

// Ensure site directory exists
async function ensureSiteDir() {
  try {
    await fs.mkdir(SITE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating site directory:', error);
  }
}

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/preview - Get current preview HTML
app.get('/api/preview', async (req, res) => {
  try {
    if (!fsSync.existsSync(PREVIEW_FILE)) {
      return res.json({ preview: null });
    }
    const preview = await fs.readFile(PREVIEW_FILE, 'utf-8');
    res.json({ preview });
  } catch (error) {
    console.error('Error reading preview:', error);
    res.status(500).json({ error: 'Failed to read preview' });
  }
});

// POST /api/generate - Generate preview using Ollama
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  try {
    // Read current live.html
    let currentCode = '';
    if (fsSync.existsSync(LIVE_FILE)) {
      currentCode = await fs.readFile(LIVE_FILE, 'utf-8');
    } else {
      return res.status(400).json({
        error: 'No live.html found. Please create the initial site file.',
      });
    }

    console.log('Querying Ollama...');
    const aiResponse = await queryOllama(currentCode, prompt);

    // Validate the response
    const validation = validateHTMLOutput(aiResponse);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'AI output validation failed',
        details: validation.errors,
      });
    }

    // Write preview.html
    await fs.writeFile(PREVIEW_FILE, aiResponse, 'utf-8');
    console.log('Preview written to:', PREVIEW_FILE);

    res.json({
      success: true,
      message: 'Preview generated successfully',
      preview: aiResponse,
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({
      error: 'Failed to generate preview',
      details: error.message,
    });
  }
});

// POST /api/publish - Publish changes to live and commit to GitHub
app.post('/api/publish', async (req, res) => {
  try {
    // Verify preview exists
    if (!fsSync.existsSync(PREVIEW_FILE)) {
      return res.status(400).json({
        error: 'No preview available. Generate a preview first.',
      });
    }

    const previewContent = await fs.readFile(PREVIEW_FILE, 'utf-8');

    // Copy preview.html to live.html
    await fs.copyFile(PREVIEW_FILE, LIVE_FILE);
    console.log('Published preview to live.html');

    // Try to commit to GitHub if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const commitSha = await commitFileToGitHub(
          'site/live.html',
          previewContent,
          'AI-modified code update'
        );
        console.log('Committed to GitHub:', commitSha);

        res.json({
          success: true,
          message: 'Changes published and committed to GitHub',
          commitSha,
        });
      } catch (githubError) {
        console.error('GitHub commit failed:', githubError);
        // Even if GitHub fails, the file was updated locally
        res.json({
          success: true,
          message:
            'Changes published locally but GitHub commit failed. Check GITHUB_TOKEN and GITHUB_REPO.',
          githubError: githubError.message,
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Changes published locally. GitHub token not configured.',
      });
    }
  } catch (error) {
    console.error('Error publishing:', error);
    res.status(500).json({
      error: 'Failed to publish changes',
      details: error.message,
    });
  }
});

// Serve static files from client
app.use(
  express.static(path.join(__dirname, '..', 'client', 'dist'), {
    extensions: ['html'],
  })
);

// Serve site folder
app.use('/site', express.static(SITE_DIR));

// Start server
async function startServer() {
  await ensureSiteDir();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;
