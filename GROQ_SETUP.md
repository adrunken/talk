# Groq Free API Setup (2 minutes)

## Why Groq?

✅ **Completely free** - No credit card, no trial period limit  
✅ **Super fast** - Fastest AI inference (best user experience)  
✅ **High rate limits** - Thousands of requests per month free  
✅ **Great for code** - mixtral-8x7b is excellent for HTML/CSS/JS generation  

---

## Step 1: Sign Up

1. Go to [https://console.groq.com](https://console.groq.com)
2. Click **Sign Up**
3. Create account (email or GitHub)
4. No credit card required

---

## Step 2: Get Your API Key

1. After signing up, go to **API Keys** section
2. Click **Create New API Key**
3. Copy the key (looks like `gsk_xxxxxxxxxxxx`)
4. Keep it secret!

---

## Step 3: Set Environment Variable

### On Render:

1. Go to your **main app service** dashboard
2. Click **Environment** tab
3. Add new variable:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxx
   ```
   (Paste your actual API key from Step 2)
4. Click **Save** (auto-redeploys)

### Local Development:

Create a `.env` file:
```
GROQ_API_KEY=gsk_xxxxxxxxxxxx
GITHUB_TOKEN=your_github_token
GITHUB_REPO=your_repo
PORT=12000
```

Then start your app:
```bash
npm start
```

---

## Step 4: Test

1. Open your app
2. Go to **AI Code Editor**
3. Enter a test prompt: `"Add a red button that says 'Click Me' to the page"`
4. Click **Generate**
5. Should see preview within 5-10 seconds

---

## Rate Limits (Free Tier)

- **14,400 requests/day** (plenty for most use cases)
- **30 requests/minute** (one at a time is fine)
- **No monthly bill** - Completely free forever

For reference:
- 1 code generation = 1 request
- If you use AI heavily: ~100/day = still within free tier

---

## Troubleshooting

### "GROQ_API_KEY environment variable is not set"
- Check that you set `GROQ_API_KEY` in Render environment
- Restart your Render service
- Verify the key is correct (starts with `gsk_`)

### "API Error: 401 Unauthorized"
- API key is wrong or expired
- Get a new one from console.groq.com

### "Model not found"
- Groq is having temporary issues
- Try again in a minute

### Rate limit exceeded
- Free tier limit: 14,400 requests/day
- This is generous - you'd need 200 generations per day to hit it

---

## What Changed in Your Code

Your `server/ollama.js` now:
- Uses Groq API instead of local Ollama
- No need for Ollama service or extra Render container
- Stays within free tier limits ✅
- Still uses the same interface (your frontend doesn't change)

---

## Benefits Over Ollama on Render

| Feature | Groq | Ollama on Render |
|---------|------|------------------|
| Cost | Free (forever) | $7+/month |
| Setup Time | 2 min | 20 min |
| Speed | <1 sec response | 10+ sec |
| Model Quality | Excellent (mixtral) | Good (deepseek) |
| Rate Limits | 14.4k/day | Unlimited |
| Reliability | 99.9% uptime | Depends on Render |

---

## Questions?

- Groq Docs: https://console.groq.com/docs
- API Status: https://status.groq.com
- Support: team@groq.com
