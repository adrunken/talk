# Setting Up Ollama on Render

## Step 1: Create a New Render Web Service for Ollama

1. Go to [https://render.com](https://render.com) and sign in
2. Click **New +** → **Web Service**
3. Connect your GitHub repo (already connected)
4. Configure:
   - **Name**: `ollama-ai` (or your preferred name)
   - **Runtime**: Docker
   - **Build Command**: Leave empty (using provided Dockerfile)
   - **Start Command**: Leave empty (using provided Dockerfile CMD)
   - **Instance Type**: Standard (minimum 2GB RAM)
   - **Region**: Select same region as your main app

5. Click **Create Web Service**

## Step 2: Set Environment Variables

On the Render dashboard for the Ollama service:
1. Go to **Environment** tab
2. Add these variables:
   ```
   OLLAMA_HOST=0.0.0.0:11434
   OLLAMA_MODELS=/models
   ```

## Step 3: Get Your Ollama URL

Once deployed, Render will give you a URL like:
```
https://ollama-ai-xxxx.onrender.com
```

The Ollama API endpoint will be:
```
https://ollama-ai-xxxx.onrender.com/api/generate
```

## Step 4: Configure Your Main App

In your main app's Render dashboard:
1. Go to **Environment** tab
2. Add:
   ```
   OLLAMA_URL=https://ollama-ai-xxxx.onrender.com
   ```
   (Replace with your actual Ollama service URL)

3. Restart the service

## Step 5: Verify Connection

Once both services are running, check that the connection works by visiting:
```
https://ollama-ai-xxxx.onrender.com/api/tags
```

You should see the model list. If deepseek-coder isn't there, the Ollama service is pulling it automatically on startup.

## Troubleshooting

- **Ollama service slow to start**: The deepseek-coder model (~4GB) is being downloaded on first run. This can take 5-10 minutes.
- **404 on /api/generate**: Wait for the model to fully load
- **Connection refused**: Ensure both services are in the running state
- **Out of memory**: Render free tier may not have enough RAM. Use Standard instance or higher

## Note

- Keep your main app and Ollama service on the same Render account for easier management
- Ollama will auto-pull deepseek-coder:6.7b on first startup (requires ~4GB disk space)
- The service may take 15+ minutes to deploy the first time
