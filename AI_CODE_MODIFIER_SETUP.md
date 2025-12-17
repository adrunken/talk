# AI Code Modifier Setup Guide

This guide covers how to set up and deploy the AI-powered code modification system locally and on Render.

## Overview

The system allows users to:
1. Describe changes in natural language
2. See a live preview of changes in an iframe
3. Publish changes to GitHub when satisfied

**Tech Stack:**
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **AI:** Ollama (deepseek-coder:6.7b, runs locally)
- **Deployment:** Render (free tier)
- **Version Control:** GitHub

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- Ollama installed and running
- Git
- GitHub account with a repository

### Step 1: Install Ollama

1. Download Ollama from https://ollama.ai
2. Install and run it
3. In a terminal, pull the required model:

```bash
ollama pull deepseek-coder:6.7b
```

Verify Ollama is running:
```bash
curl http://localhost:11434/api/health
```

You should see a response like `{"status":"success"}`.

### Step 2: Set Up the Project

Clone and install dependencies:

```bash
cd /project-root
npm install

cd client
npm install
cd ..
```

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Ollama configuration (default)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-coder:6.7b

# GitHub configuration
GITHUB_TOKEN=your_personal_access_token_here
GITHUB_REPO=your-username/your-repo-name
GITHUB_BRANCH=main

# Server configuration
PORT=3001
```

**How to get GITHUB_TOKEN:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" (classic)
3. Select scopes: `repo` (full control of private repositories)
4. Copy the token and paste it in .env

### Step 4: Run Local Dev Environment

**Terminal 1 - Start Backend:**
```bash
npm run dev
```

Should output: `Server running at http://0.0.0.0:3001`

**Terminal 2 - Start Frontend (in another terminal):**
```bash
npm run client:dev
```

Should output: `➜  Local:   http://localhost:5173/`

### Step 5: Open and Test

1. Open http://localhost:5173 in your browser
2. You should see the AI Code Modifier interface
3. Try a simple change like: "Add a dark navbar at the top"
4. Click "Generate Preview" to test Ollama integration
5. Review the changes in the preview
6. Click "Publish Changes" to commit to GitHub

---

## Project Structure

```
/project-root
├── /server
│   ├── index.js           # Express server & endpoints
│   ├── ollama.js          # Ollama integration
│   ├── github.js          # GitHub API integration
│   └── validation.js      # HTML validation logic
├── /client
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── components/
│   │   │   ├── Editor.jsx      # Prompt input & controls
│   │   │   ├── Preview.jsx     # Live preview iframe
│   │   │   └── ErrorDialog.jsx # Error handling
│   │   ├── index.css      # Global styles
│   │   └── main.jsx       # Entry point
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── /site
│   ├── live.html          # Current production site
│   └── preview.html       # AI-modified preview (auto-generated)
├── package.json           # Root dependencies
└── AI_CODE_MODIFIER_SETUP.md # This file
```

---

## API Endpoints

### `POST /api/generate`

Generates a preview using Ollama.

**Request:**
```json
{
  "prompt": "Add a dark navbar to the top without removing anything"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Preview generated successfully",
  "preview": "<html>...</html>"
}
```

**Response (Error):**
```json
{
  "error": "AI output validation failed",
  "details": ["Missing <html> tag"]
}
```

### `POST /api/publish`

Publishes preview.html to live.html and commits to GitHub.

**Request:** (no body needed)

**Response (Success):**
```json
{
  "success": true,
  "message": "Changes published and committed to GitHub",
  "commitSha": "abc123..."
}
```

### `GET /api/preview`

Gets the current preview.

**Response:**
```json
{
  "preview": "<html>...</html>"
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Deployment to Render (Free Tier)

### Step 1: Prepare Repository

1. Push your code to GitHub:
```bash
git add .
git commit -m "Initial commit: AI Code Modifier"
git push origin main
```

2. Ensure your repository is public (required for free tier)

### Step 2: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 3: Create Web Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name:** ai-code-modifier
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Region:** Choose closest to you
   - **Plan:** Free

### Step 4: Add Environment Variables

In the Render dashboard:

1. Go to your service → Environment
2. Add these variables:
   ```
   GITHUB_TOKEN=your_personal_access_token
   GITHUB_REPO=your-username/your-repo
   GITHUB_BRANCH=main
   PORT=3001
   NODE_ENV=production
   ```

3. For Ollama, you have two options:

**Option A: Self-hosted Ollama (Recommended for free tier)**
- Set `OLLAMA_URL=http://your-machine-ip:11434`
- Keep Ollama running on your machine

**Option B: Render + Ollama Docker (Advanced)**
- Create a separate Render service for Ollama
- Use that service's URL for `OLLAMA_URL`

### Step 5: Deploy

1. Render automatically deploys on `git push`
2. Wait for the build to complete (2-5 minutes)
3. Your app will be at `https://ai-code-modifier.render.com`

### Step 6: Test Deployment

```bash
curl https://ai-code-modifier.render.com/api/health
```

Should respond: `{"status":"ok"}`

---

## Preview vs Publish Workflow

### Preview (`/api/generate`)
- Reads `/site/live.html`
- Sends to Ollama with your prompt
- Validates HTML output
- Writes to `/site/preview.html`
- Does NOT commit to GitHub
- Displays in iframe for review

### Publish (`/api/publish`)
- Copies `/site/preview.html` → `/site/live.html`
- Commits to GitHub via REST API
- Render auto-redeploys
- Changes go live

### Security
- GitHub token never exposed to frontend
- Only stored in environment variables
- Commits only happen on explicit user action
- No arbitrary code execution

---

## Validation Rules

The AI output is validated before writing to preview.html:

✅ Must have `<html>` tag
✅ Must have `<body>` tag
✅ Must have `</html>` closing tag
✅ Must not contain markdown fences (\`\`\`)
✅ Must not exceed 300 KB
✅ Must have reasonable tag balance

❌ If validation fails, the error is shown to the user
❌ No file is written
❌ User can adjust their prompt and try again

---

## Troubleshooting

### Ollama Connection Error

**Error:** `Failed to query Ollama: Connection refused`

**Solution:**
1. Make sure Ollama is running: `ollama serve`
2. Check if the model is downloaded: `ollama list`
3. If missing, pull it: `ollama pull deepseek-coder:6.7b`
4. Verify endpoint: `curl http://localhost:11434/api/health`

### GitHub Commit Failed

**Error:** `GitHub API error: 401`

**Solution:**
1. Check GITHUB_TOKEN is valid
2. Go to https://github.com/settings/tokens
3. Verify token has `repo` scope
4. Token might be expired, regenerate if needed

### Preview Not Updating

**Error:** iframe shows old content

**Solution:**
1. Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R)
2. Check browser console for errors (F12)
3. Verify backend is running: `curl http://localhost:3001/api/health`

### Build Fails on Render

**Error:** `npm run build: command not found`

**Solution:**
1. Check package.json has `build` script
2. Ensure all dependencies are listed in package.json
3. Check client/package.json exists and has `build` script
4. Render logs show detailed error messages

### Ollama Model Too Large

**Error:** `Model deepseek-coder:6.7b` takes too much time

**Solution (Alternative models):**
```bash
# Faster but less capable
ollama pull mistral:latest

# Update server/ollama.js:
const MODEL = 'mistral:latest';
```

---

## Customization

### Change Initial Site

Edit `/site/live.html` to replace the sample website with your actual HTML.

### Change Ollama Model

In `server/ollama.js`:
```javascript
const MODEL = 'your-model-name';
```

Then pull it:
```bash
ollama pull your-model-name
```

### Customize UI

React components are in `client/src/components/`. Edit styles in `client/src/index.css` or individual component files.

### Change System Instruction

In `server/ollama.js`, modify `SYSTEM_INSTRUCTION`:
```javascript
const SYSTEM_INSTRUCTION = `Your custom instruction...`;
```

---

## Security Checklist

- [ ] GitHub token is in `.env`, not committed
- [ ] `.env` is in `.gitignore`
- [ ] GitHub token has minimal required scopes (repo only)
- [ ] Render environment variables are private
- [ ] No secrets in client-side code
- [ ] HTML validation prevents injection attacks
- [ ] CORS is configured properly

---

## FAQ

**Q: Can I use a different AI model?**
A: Yes. Install any model with `ollama pull model-name` and update `server/ollama.js`.

**Q: How do I deploy without GitHub?**
A: The publish feature requires GitHub. You can still use preview-only mode (remove GitHub integration).

**Q: Is my code private?**
A: Yes. The AI runs locally on your machine (or Render instance). Only published changes go to GitHub.

**Q: Can I modify multiple files at once?**
A: Currently supports single HTML file. To extend: update backend to handle multiple files and validate each.

**Q: What if Ollama returns markdown instead of HTML?**
A: The validation catches this and shows an error. System instruction is designed to prevent it, but you can refine the prompt.

---

## Support

- **Ollama Issues:** https://github.com/ollama/ollama/issues
- **Express Issues:** https://expressjs.com/
- **Render Issues:** https://docs.render.com

---

**Last Updated:** 2024
**Version:** 1.0.0
