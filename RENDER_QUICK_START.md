# 🚀 Render Ollama Setup - Quick Start (5 Steps)

## Step 1️⃣: Create Ollama Service
- Render Dashboard → **New + → Web Service**
- Select your GitHub repo
- **Name**: `ollama-ai`
- **Runtime**: Docker
- **Dockerfile Path**: `./Dockerfile.ollama`
- **Instance**: Standard (minimum)
- Click **Create Web Service**

## Step 2️⃣: Wait for Deploy
⏱️ **15-20 minutes** for first deployment (downloading deepseek-coder model)

✅ When done, Render gives you a URL like: `https://ollama-ai-abc123.onrender.com`

## Step 3️⃣: Copy Ollama URL
From Render dashboard:
```
https://ollama-ai-abc123.onrender.com  ← Copy this
```

## Step 4️⃣: Set OLLAMA_URL in Main App
1. Go to your **main app service** on Render
2. **Environment** tab → **Add environment variable**
3. Key: `OLLAMA_URL`
4. Value: `https://ollama-ai-abc123.onrender.com` (paste from Step 3)
5. Click **Save** (auto-redeploys your app)

## Step 5️⃣: Test
1. Open your app in browser
2. **AI Code Editor** → Enter test prompt
3. Click **Generate**
4. Should see preview within 60 seconds

---

## 🔧 Local Testing First (Optional)

If you want to test locally before deploying:

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Pull model (only once)
ollama pull deepseek-coder:6.7b

# Terminal 3: Run your app
export OLLAMA_URL=http://localhost:11434
npm start
```

---

## ❌ Common Issues

| Issue | Fix |
|-------|-----|
| **504 Timeout** | Ollama still loading (wait 15+ min) |
| **Connection refused** | Check OLLAMA_URL in main app env vars |
| **Model not found** | Check Ollama service logs |
| **Out of memory** | Upgrade Render instance size |

---

## 📋 Files Provided

- `Dockerfile.ollama` - Dockerfile for Ollama service
- `.env.example` - Environment variable template
- `RENDER_DEPLOYMENT_GUIDE.md` - Detailed guide
- `ollama-render-setup.md` - Setup instructions

---

💡 **Key Point**: You're running 2 separate Render services that talk to each other via HTTPS.
