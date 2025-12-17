# Quick Start Guide

Get the AI Code Modifier running in 5 minutes.

## Prerequisites

- Node.js 18+
- Ollama installed
- GitHub account (for publishing)

## Installation & Running

### 1. Install Ollama & Model (First Time Only)

```bash
# Install from https://ollama.ai

# Then pull the model:
ollama pull deepseek-coder:6.7b

# Verify it works:
curl http://localhost:11434/api/health
# Should return: {"status":"success"}
```

### 2. Setup Environment

```bash
cd /project-root

# Create .env file
cat > .env << EOF
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO=your-username/your-repo
GITHUB_BRANCH=main
PORT=3001
OLLAMA_URL=http://localhost:11434
EOF
```

**Get GitHub token:** https://github.com/settings/tokens → Generate new (classic) → Select `repo` scope

### 3. Install Dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 4. Start Services

**Terminal 1 (Backend):**
```bash
npm run dev
```
Should show: `Server running at http://0.0.0.0:3001`

**Terminal 2 (Frontend):**
```bash
npm run client:dev
```
Should show: `➜  Local:   http://localhost:5173/`

### 5. Open & Test

Go to http://localhost:5173

Type: "Add a dark navbar at the top"

Click: "Generate Preview"

Watch it modify live!

---

## Test Prompts

Try these to test the system:

1. **"Add a dark navbar at the top"**
   - Simple, low-risk change
   - Tests basic modification

2. **"Make all text larger and bigger"**
   - Tests font size changes
   - Tests styling preservation

3. **"Add a footer with copyright"**
   - Tests addition of new elements
   - Tests structure preservation

4. **"Change the button color to green"**
   - Tests style modifications
   - Tests selector accuracy

---

## Common Issues & Quick Fixes

| Issue | Fix |
|-------|-----|
| "Connection refused" on generate | `ollama serve` in another terminal |
| "No preview generated" | Check that live.html exists in /site |
| "GitHub commit failed" | Verify GITHUB_TOKEN is valid, not expired |
| Preview shows blank | Refresh page, check browser console |
| Changes not appearing | Clear iframe cache, try harder refresh (Ctrl+Shift+R) |

---

## Publish to GitHub

When you're happy with the preview:

1. Click "Publish Changes"
2. Check your GitHub repo - new commit appears!
3. If using Render, it auto-redeploys

---

## Next Steps

- Read `AI_CODE_MODIFIER_SETUP.md` for detailed setup
- Read `ARCHITECTURE_AND_WORKFLOW.md` to understand how it works
- Modify `/site/live.html` to use your own HTML
- Deploy to Render for public access

---

## File Structure

```
/project-root
├── server/          # Backend
├── client/          # Frontend React
├── site/
│   ├── live.html    ← Your main site
│   └── preview.html ← AI previews go here
├── package.json
├── .env             ← GitHub token here
└── AI_CODE_MODIFIER_SETUP.md
```

---

**Tip:** Keep Ollama running (`ollama serve`) while using the system!
