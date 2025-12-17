# AI Code Modifier - Architecture & Workflow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (http://localhost:5173)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   React Frontend (Vite)                   │   │
│  │                                                           │   │
│  │  ┌──────────────────┐    ┌──────────────┐               │   │
│  │  │  Editor Panel    │    │  Preview     │               │   │
│  │  │  - Textarea      │    │  - iframe    │               │   │
│  │  │  - Generate btn  │    │    embed     │               │   │
│  │  │  - Publish btn   │    │    live.html │               │   │
│  │  └──────────────────┘    └──────────────┘               │   │
│  │           │                      ▲                       │   │
│  │           │ JSON requests        │ JSON responses       │   │
│  └───────────┼──────────────────────┼───────────────────────┘   │
│              │                      │                            │
│              ▼                      │                            │
├─────────────────────────────────────────────────────────────────┤
│          HTTP / CORS Proxy                                       │
├─────────────────────────────────────────────────────────────────┤
│              │                      │                            │
│              ▼                      │                            │
│  ┌─────────────────────────────────────────────────────┐         │
│  │           Express Server (http://localhost:3001)    │         │
│  │                                                     │         │
│  │  POST /api/generate                                │         │
│  │  ├─ Read /site/live.html                           │         │
│  │  ├─ Query Ollama API                               │         │
│  │  ├─ Validate HTML output                           │         │
│  │  └─ Write /site/preview.html                       │         │
│  │                                                     │         │
│  │  POST /api/publish                                 │         │
│  │  ├─ Copy preview.html → live.html                  │         │
│  │  ├─ GitHub API commit                              │         │
│  │  └─ Return success/error                           │         │
│  └─────────────────────────────────────────────────────┘         │
│     │              ▲              │                              │
│     │              │              │                              │
│     │ HTTP queries │ JSON         │                              │
│     ▼              │              ▼                              │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐                │
│  │ /site/   │  │  Ollama    │  │  GitHub API  │                │
│  │ live.html│  │  localhost │  │  REST v3     │                │
│  │ preview  │  │  :11434    │  │  api.github  │                │
│  │ .html    │  │            │  │  .com        │                │
│  └──────────┘  └────────────┘  └──────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Frontend (React + Vite + Tailwind)

**Entry Point:** `client/src/main.jsx`

**Main Component Tree:**
```
App.jsx
├── Editor.jsx
│   ├── Textarea (prompt input)
│   ├── "Generate Preview" button
│   └── "Publish Changes" button
├── Preview.jsx
│   └── iframe (displays /site/preview.html)
└── ErrorDialog.jsx
    └── Error messages
```

**State Management:**
- `prompt` - User's natural language request
- `preview` - Current preview HTML content
- `loading` - Generate request in progress
- `publishing` - Publish request in progress
- `error` - Current error message

**API Calls:**
- `GET /api/preview` - Fetch current preview on mount
- `POST /api/generate` - Generate new preview
- `POST /api/publish` - Publish and commit

### Backend (Node.js + Express)

**Entry Point:** `server/index.js`

**Modules:**

#### server/ollama.js
```javascript
queryOllama(currentCode, userRequest)
  │
  ├─ Build prompt with system instruction
  ├─ POST http://localhost:11434/api/generate
  ├─ Stream or wait for response
  └─ Return trimmed HTML string
```

**System Instruction (non-negotiable):**
```
You are an expert web engineer.
You are modifying an existing website.
Preserve all unrelated code and functionality.
Apply ONLY the requested changes.
Return a complete, valid HTML document.
Do not explain.
Do not use markdown.
Do not add comments outside code.
```

#### server/validation.js
```javascript
validateHTMLOutput(html)
  │
  ├─ Check size ≤ 300 KB
  ├─ Check <html> tag exists
  ├─ Check <body> tag exists
  ├─ Check no markdown fences (```)
  ├─ Check closing tags
  └─ Return { isValid, errors[] }
```

#### server/github.js
```javascript
commitFileToGitHub(filePath, content, message)
  │
  ├─ GET latest commit SHA
  ├─ POST blob (file content)
  ├─ POST tree (file reference)
  ├─ POST commit (new commit object)
  └─ PATCH ref (update branch pointer)
```

Uses GitHub REST API v3 (no external libraries needed).

#### server/index.js
```
Express Server
├── GET /api/health
├── GET /api/preview
├── POST /api/generate
│   ├─ Validate prompt
│   ├─ Read live.html
│   ├─ Query Ollama
│   ├─ Validate output
│   ├─ Write preview.html
│   └─ Return preview or error
├── POST /api/publish
│   ├─ Check preview exists
│   ├─ Copy → live.html
│   ├─ Commit to GitHub
│   └─ Return success or error
└── Static file serving (client & site)
```

---

## Complete User Flow (Step-by-Step)

### 1. User Opens App
```
Browser: GET http://localhost:5173
  ↓
Vite serves React app
  ↓
App.jsx mounts
  ↓
useEffect calls GET /api/preview
  ↓
Display preview in iframe (if exists) or empty state
```

### 2. User Enters Prompt
```
User types: "Add a dark navbar at the top"
  ↓
state.prompt = "Add a dark navbar at the top"
```

### 3. User Clicks "Generate Preview"
```
User clicks button
  ↓
POST /api/generate { prompt: "..." }
  ↓
BACKEND:
  ├─ Read /site/live.html (full current HTML)
  ├─ POST Ollama with live.html + prompt + system instruction
  ├─ Ollama (deepseek-coder:6.7b) processes
  ├─ Returns modified HTML (complete document)
  ├─ Validate HTML structure
  ├─ Write /site/preview.html
  └─ Return preview HTML to frontend
  ↓
FRONTEND:
  ├─ Receive preview HTML
  ├─ setState(preview)
  ├─ iframe.srcdoc = preview (updates live)
  └─ User sees changes in iframe
```

### 4. User Reviews Preview
```
Preview iframe displays the modified HTML
User can:
- Interact with preview (click buttons, fill forms, etc.)
- Read the HTML source if they view page source
- Go back to edit prompt for different request
```

### 5. User Clicks "Publish Changes"
```
User clicks button (only enabled if preview exists)
  ↓
POST /api/publish (no body)
  ↓
BACKEND:
  ├─ Check /site/preview.html exists
  ├─ Copy preview.html → live.html (✓ now on disk)
  ├─ IF GITHUB_TOKEN env var set:
  │   ├─ Read live.html content
  │   ├─ Call GitHub API to commit
  │   ├─ Render sees new commit on main
  │   └─ Render auto-redeploys your app
  ├─ Return success message
  └─ Return to frontend
  ↓
FRONTEND:
  ├─ Show success alert
  ├─ Clear prompt
  ├─ Keep preview visible
  └─ User can make more changes
```

### 6. Render Auto-Deploy (if on Render)
```
GitHub receives commit
  ↓
Render webhook triggers
  ↓
Render runs: npm install && npm run build
  ↓
Render runs: npm start
  ↓
App restarts with NEW live.html
  ↓
Your website is updated!
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     USER REQUEST FLOW                        │
└─────────────────────────────────────────────────────────────┘

[1] GENERATE FLOW
   prompt
     │
     ├─→ POST /api/generate
     │     │
     │     ├─→ Read /site/live.html
     │     │     │
     │     │     └─→ (original HTML)
     │     │
     │     ├─→ QueryOllama(live.html, prompt)
     │     │     │
     │     │     ├─→ POST http://localhost:11434/api/generate
     │     │     │     │
     │     │     │     └─→ deepseek-coder:6.7b processes
     │     │     │
     │     │     └─→ returns: modified HTML
     │     │
     │     ├─→ ValidateHTML(response)
     │     │     │
     │     │     ├─→ Check size, tags, structure
     │     │     └─→ Return { isValid, errors }
     │     │
     │     ├─→ Write /site/preview.html
     │     │
     │     └─→ Return preview to frontend
     │
     └─→ Display in iframe


[2] PUBLISH FLOW
   "Publish" button
     │
     ├─→ POST /api/publish
     │     │
     │     ├─→ Verify /site/preview.html exists
     │     │
     │     ├─→ Copy preview.html → live.html
     │     │     │
     │     │     └─→ (now live on local disk)
     │     │
     │     ├─→ IF GITHUB_TOKEN:
     │     │     │
     │     │     ├─→ commitFileToGitHub()
     │     │     │     │
     │     │     │     ├─→ Get latest commit SHA
     │     │     │     ├─→ Create blob (file content)
     │     │     │     ├─→ Create tree (references)
     │     │     │     ├─→ Create commit (new commit)
     │     │     │     └─→ Update branch ref
     │     │     │
     │     │     └─→ GitHub receives commit
     │     │           │
     │     │           └─→ Render webhook triggers
     │     │                 │
     │     │                 └─→ Render auto-deploys
     │     │
     │     └─→ Return success to frontend
     │
     └─→ Show confirmation, clear prompt
```

---

## File Modifications Timeline

```
Timeline of /site/live.html and /site/preview.html:

[START]
  live.html    = sample website (unchanged)
  preview.html = empty

[USER GENERATES PREVIEW #1]
  Request: "Add dark navbar"
  Ollama modifies HTML
  
  live.html    = sample website (unchanged)
  preview.html = sample + dark navbar

[USER PREVIEWS]
  iframe displays preview.html
  User clicks around, reads HTML

[USER GENERATES PREVIEW #2]
  Request: "Make text larger"
  Ollama modifies based on LIVE.HTML (not preview!)
  
  live.html    = sample website (unchanged)
  preview.html = sample + larger text

[USER PUBLISHES]
  Copies preview.html → live.html
  
  live.html    = sample + larger text (NOW LIVE!)
  preview.html = sample + larger text (stays same)

[USER GENERATES PREVIEW #3]
  Request: "Add footer"
  Ollama modifies based on LIVE.HTML
  
  live.html    = sample + larger text (unchanged)
  preview.html = sample + larger text + footer
```

**Key Point:** AI always modifies from `live.html`, not `preview.html`. This ensures each change is based on the current live state.

---

## Error Handling

### Frontend Errors
1. **No preview text:** Show disabled button
2. **Network error:** Display error dialog
3. **Validation failed:** Show specific error messages
4. **GitHub error:** Show but allow local publish

### Backend Errors
1. **Ollama unavailable:** Return HTTP 500 + message
2. **Invalid prompt:** Return HTTP 400
3. **Validation failed:** Return HTTP 400 + error array
4. **GitHub token missing/invalid:** Return warning but complete locally
5. **File system error:** Return HTTP 500

### User Sees
- Clear error messages in dialog
- Can retry with adjusted prompt
- No file corruption or loss
- Can revert via GitHub history if needed

---

## Security Model

### Frontend Security
- ✅ No secrets in code
- ✅ No direct API access to sensitive endpoints
- ✅ No file system access
- ✅ iframe sandbox restricts untrusted preview content

### Backend Security
- ✅ GitHub token in environment variables only
- ✅ CORS configured for localhost
- ✅ HTML validation prevents injection
- ✅ No eval() or dynamic code execution
- ✅ No shell commands
- ✅ Commits only on explicit user action

### GitHub Security
- ✅ Token has minimal scope (repo only)
- ✅ Can revoke token anytime
- ✅ Commits are audited in GitHub history
- ✅ Auto-rollback via GitHub revert if needed

---

## Extensibility Points

### 1. Add More Files
- Modify backend to handle multiple files
- Update Ollama prompt to handle file list
- Validate each file separately

### 2. Custom Ollama Models
- Change `const MODEL` in server/ollama.js
- Pull model: `ollama pull model-name`
- Adjust system instruction as needed

### 3. Version Control Integration
- Current: GitHub only
- Could add: GitLab, Gitea, Gitree
- Swap server/github.js implementation

### 4. UI Customization
- Edit React components in client/src/
- Change Tailwind config
- Add new pages/views

### 5. AI Model Selection
- Add dropdown to select model
- Store user preference in state
- Pass to backend via request

---

## Deployment Environments

### Local Development
```
Browser: http://localhost:5173
  ↓
Vite dev server
  ↓ (proxy)
Express: http://localhost:3001
  ↓
Ollama: http://localhost:11434
```

### Render Production
```
Browser: https://your-app.render.com
  ↓
Render static + Express
  ↓
Ollama: http://your-machine:11434 (or remote)
  ↓
GitHub: Commit on publish
```

---

**Version:** 1.0.0
**Updated:** 2024
