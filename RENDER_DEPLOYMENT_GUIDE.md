# Render Deployment Guide: Ollama + Main App

## Overview

You'll be running TWO services on Render:
1. **Ollama Service** (separate) - Runs the deepseek-coder AI model
2. **Main App** (your existing service) - Connects to Ollama

## Prerequisites

- [ ] GitHub repo connected to Render
- [ ] Render account with billing info (free tier may timeout for AI)
- [ ] GitHub token with repo access (for publishing changes)

---

## Part 1: Deploy Ollama Service

### Step 1.1: Create New Web Service

1. Go to **Render Dashboard** → Click **New +** → **Web Service**
2. Select your GitHub repository
3. Fill in:
   - **Name**: `ollama-ai`
   - **Runtime**: Docker
   - **Build Command**: (leave blank)
   - **Start Command**: (leave blank)
   - **Instance Type**: Standard (minimum 2GB RAM - free tier likely won't work for AI)

### Step 1.2: Add the Dockerfile

The `Dockerfile.ollama` file is in your repo root. Render will auto-detect it.

**If using a custom name**, update in Render settings:
- **Dockerfile Path**: `./Dockerfile.ollama`

### Step 1.3: Configure Environment

In Render Dashboard for Ollama service:

Go to **Environment** tab and add:

```
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_MODELS=/models
```

### Step 1.4: Deploy

Click **Create Web Service** and wait for deployment.

**⏱️ First deployment takes 10-20 minutes:**
- Building Docker image
- Starting Ollama
- Downloading deepseek-coder model (~4GB)

**Check logs**: Look for `Ollama running on 0.0.0.0:11434`

### Step 1.5: Get Your Ollama URL

Once deployed, Render displays a URL like:
```
https://ollama-ai-abcd1234.onrender.com
```

**Save this URL** - you'll need it in Step 2.

---

## Part 2: Configure Main App

### Step 2.1: Set Environment Variable

In your **main app's** Render dashboard:

1. Go to **Environment** tab
2. Add new variable:
   ```
   OLLAMA_URL=https://ollama-ai-abcd1234.onrender.com
   ```
   *(Replace with your actual Ollama service URL from Step 1.5)*

3. Click **Save Changes** 
4. Render will **auto-redeploy** your app

### Step 2.2: Verify Connection

Once restarted, your app will now connect to the remote Ollama service.

To test manually, visit:
```
https://your-main-app-url.onrender.com/api/health
```

Should return:
```json
{"status": "ok"}
```

---

## Part 3: Test AI Code Generation

1. Open your app in browser
2. Go to **AI Code Editor** panel
3. Enter a test prompt: `"Add a comment to the page saying 'Hello from AI'"`
4. Click **Generate**
5. Should see preview update within 30-60 seconds

**If it times out:**
- Check Render Ollama service logs (still loading model?)
- Try again in 2 minutes
- Verify `OLLAMA_URL` is set correctly

---

## Troubleshooting

### Ollama service won't start
- **Check logs**: Render Dashboard → Ollama service → Logs tab
- **Out of memory**: Upgrade to Standard or higher instance
- **Disk space**: May need 5GB free (Render free tier = 0.5GB, upgrade needed)

### 504 Gateway Timeout
- **Cause**: Ollama still loading model on first run
- **Solution**: Wait 15+ minutes, try again

### ECONNREFUSED errors
- **Cause**: Ollama service URL wrong or not running
- **Solution**: 
  - Check `OLLAMA_URL` in main app environment
  - Verify Ollama service status is "Live"
  - Test Ollama endpoint directly: `https://ollama-ai-xxx.onrender.com/api/tags`

### Model not found
- **Cause**: deepseek-coder:6.7b hasn't downloaded yet
- **Solution**: Check Ollama logs, wait for download to complete

---

## Production Checklist

- [ ] Ollama service is "Live" (green status)
- [ ] Main app is "Live" 
- [ ] OLLAMA_URL env var is set in main app
- [ ] AI generation works (test from UI)
- [ ] GitHub token is set for publishing
- [ ] Free tier resource limits understood (may need upgrade)

---

## Local Testing (Before Render)

To test locally with localhost Ollama:

1. Install Ollama: https://ollama.ai
2. Run: `ollama serve`
3. In another terminal: `ollama pull deepseek-coder:6.7b`
4. Set environment: `export OLLAMA_URL=http://localhost:11434`
5. Start your app: `npm start`
6. Test: Open app and try AI generation

---

## Performance Notes

- **Render Free Tier**: May be too slow for AI generation (timeouts)
- **Standard Instance**: 2GB RAM, usually sufficient
- **Pro Instance**: Recommended for production use
- **Model Size**: deepseek-coder:6.7b ≈ 4GB (watch disk space)

---

## Next Steps

1. Create Ollama service following **Part 1**
2. Configure main app following **Part 2**
3. Test from browser following **Part 3**
4. If issues, check **Troubleshooting** section

Questions? Check Render logs first - they're very informative!
