# YouTube Shorts Auto Publisher 🎬

**AI-powered YouTube Shorts content pipeline** with queue management, analytics, gamification, hook/plugin system, OAuth token refresh, and video processing.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🤖 AI Content Pipeline** | Auto-generates titles, descriptions, tags, thumbnails via OpenAI |
| **📋 Queue Manager** | Priority-based upload queue with retry, scheduling, and smart time learning |
| **🔌 Hook/Plugin System** | Event-driven architecture with 30+ hook points, bundled plugins |
| **📊 Analytics Engine** | Event tracking, daily reports, success rate, view/like metrics |
| **🎮 Gamification** | XP, levels, streaks, missions, badges to track publishing consistency |
| **🔐 OAuth Token Management** | Auto-refresh for Google/YouTube API tokens |
| **🎥 Video Processor** | FFmpeg integration: analysis, Shorts export, subtitles, thumbnails |
| **📝 Transcription Pipeline** | Multi-tier OpenAI transcription (GPT-4o, whisper) with Turkish/English support |

## 🚀 Quick Start (Local)

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# Edit .env: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, OPENAI_API_KEY

# Start the server
npm start
# → http://localhost:8788
```

### OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Enable YouTube Data API v3
2. Create OAuth 2.0 credentials (Desktop application)
3. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
4. Click ⚙️ → "Use your own OAuth credentials"
5. Enter your Client ID and Client Secret
6. In Step 1, use this scope:
   ```
   https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl
   ```
7. Authorize APIs → Exchange authorization code for tokens
8. Copy the refresh token and add to `.env` as `GOOGLE_REFRESH_TOKEN`

## 🌐 Vercel Deployment

The API is available serverless on Vercel (config & content pipeline only — file uploads, transcription, and video processing require the local server).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/alyilmazzz/youtube-shorts-auto-publisher)

### Required Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for content generation |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | YouTube API refresh token |
| `GOOGLE_DRIVE_FOLDER_ID` | (Optional) Google Drive folder for uploads |

## 📁 Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── index.js            # Express app bridge
│   ├── health.js           # GET /api/health
│   ├── content.js          # POST /api/content/generate
│   ├── token.js            # POST /api/local-oauth/token
│   ├── status.js           # GET /api/local-oauth/status
│   └── ...                 # More API endpoints
├── public/                 # Static files (landing page)
├── src/                    # Shared source modules
│   ├── hooks/              # Hook engine (hookEngine.js)
│   ├── services/           # Core services
│   │   ├── contentPipeline.js
│   │   ├── analyticsEngine.js
│   │   ├── gamification.js
│   │   ├── notificationManager.js
│   │   ├── pipelineManager.js
│   │   ├── transcriptionPipeline.js
│   │   └── videoProcessor.js
│   ├── queue/              # Queue manager
│   ├── plugins/            # Bundled plugins
│   │   ├── autoHashtag.plugin.js
│   │   ├── sentimentAnalysis.plugin.js
│   │   └── watermark.plugin.js
│   └── utils/              # JSON store utility
├── local_oauth_refresh_server.js  # Full local server (standalone)
├── vercel.json             # Vercel configuration
├── package.json
├── .env.example
└── README.md
```

## 🔌 API Endpoints

### OAuth & Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health check |
| GET | `/api/local-oauth/status` | Auth & config status |
| POST | `/api/local-oauth/token` | Refresh Google access token |
| GET | `/api/local-oauth/auth-url` | Get OAuth authorization URL |

### Content Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/content/generate` | Generate SEO-optimized content |
| GET | `/api/content/history` | Content generation history |
| POST | `/api/content/feedback` | Submit performance feedback |

### Queue & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue` | Queue status & items |
| POST | `/api/queue` | Add item to queue |
| GET | `/api/analytics/summary` | Analytics overview |
| GET | `/api/gamification/stats` | XP, levels, missions |
| GET | `/api/plugins` | List available plugins |
| GET | `/api/notifications` | List notifications |

### Transcription (Local Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transcribe` | Transcribe audio/video file |
| GET | `/api/transcribe/capabilities` | Transcription tier info |

## 🧩 Plugin System

The hook engine supports 30+ hook points. Built-in plugins:

- **auto-hashtag** — Automatically merges trending hashtags with existing tags
- **sentiment-analysis** — Analyzes transcript sentiment and suggests emoji tone
- **watermark** — Applies watermark overlay to videos via FFmpeg

Create custom plugins: add a `.plugin.js` file to the `plugins/` directory with `name`, `version`, `description`, and `init(hooks)`.

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+ (Express)
- **AI:** OpenAI API (GPT-4o, GPT-4o-mini, Whisper)
- **Storage:** File-based JSON (local) / Environment variables (Vercel)
- **Video:** FFmpeg/FFprobe (local), upload queue
- **Deploy:** Vercel (serverless API) + Local server (full features)

---

[![GitHub](https://img.shields.io/github/license/alyilmazzz/youtube-shorts-auto-publisher)](LICENSE)
