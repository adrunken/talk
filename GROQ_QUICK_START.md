# ✅ Groq Setup - Quick Checklist

## Step 1️⃣: Get Free API Key (1 min)

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up (free, no credit card)
3. Go to **API Keys**
4. Click **Create New API Key**
5. Copy the key: `gsk_xxxxxxxxxxxx`

## Step 2️⃣: Set Environment on Render (1 min)

1. Render Dashboard → Your main app service
2. **Environment** tab
3. Add new variable:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxx
   ```
4. Click **Save** (auto-redeploys)

## Done! ✨

Your app is now ready to use AI code generation:
- **Completely free** ✅
- **No setup servers** ✅
- **Super fast** ✅
- **Works on free Render tier** ✅

### Test It

1. Open your app
2. **AI Code Editor** → Type a prompt
3. Click **Generate**
4. Preview updates in 5-10 seconds

---

## Rate Limits (You're Safe)

- **14,400 requests/day** (free tier)
- 1 code generation = 1 request
- You'd need 100+ generations daily to hit limit
- Completely free forever (no surprise bills)

---

## Need Help?

- Check `GROQ_SETUP.md` for detailed instructions
- Groq docs: https://console.groq.com/docs
- Check Render logs if getting errors
