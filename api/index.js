// ──────────────────────────────────────────────────────
// YouTube Shorts Auto Publisher — Vercel Serverless API
// Consolidated single entry point
// ──────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

// ── OAuth Token Cache ──
let cachedToken = null;

async function refreshAccessToken(force = false) {
  const now = Date.now();
  if (!force && cachedToken?.access_token && cachedToken.expiresAt - now > 120000) {
    return { ...cachedToken, cached: true, expires_in: Math.floor((cachedToken.expiresAt - now) / 1000) };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.');
  }
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  cachedToken = {
    access_token: data.access_token, token_type: data.token_type || 'Bearer',
    scope: data.scope || '', expires_in: data.expires_in || 3600,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000), cached: false,
  };
  return { ...cachedToken, cached: false };
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

// ── Root / Landing ──
app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YouTube Shorts Auto Publisher</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh}
.container{max-width:720px;padding:40px 24px;text-align:center}h1{font-size:2.2rem;background:linear-gradient(135deg,#ff4444,#ff6b6b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:12px}
.subtitle{color:#888;font-size:1.1rem;margin-bottom:36px}.card{background:#1a1a1a;border-radius:16px;padding:28px;margin-bottom:20px;text-align:left;border:1px solid #2a2a2a}
.card h2{font-size:1.2rem;color:#ff4444;margin-bottom:12px}.card p,.card li{color:#aaa;line-height:1.7;font-size:.95rem}.card ul{list-style:none;padding:0}.card ul li::before{content:"› ";color:#ff4444}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:.8rem;font-weight:600;margin:4px}.badge-green{background:#1a3a1a;color:#4ade80}.badge-red{background:#3a1a1a;color:#f87171}.badge-yellow{background:#3a3a1a;color:#facc15}
.btn{display:inline-block;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px;transition:all .2s;font-size:.95rem;color:#fff}
.btn-primary{background:#ff4444}.btn-primary:hover{background:#e03a3a}.btn-secondary{background:#2a2a2a;border:1px solid #3a3a3a}.btn-secondary:hover{background:#3a3a3a}
.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.status-item{background:#222;border-radius:10px;padding:16px;text-align:center}
.status-item .label{font-size:.8rem;color:#666;margin-bottom:4px}.status-item .value{font-size:1rem;font-weight:600}
.footer{margin-top:32px;font-size:.85rem;color:#555}.footer a{color:#ff4444;text-decoration:none}
pre{background:#111;padding:12px;border-radius:8px;margin-top:12px;font-size:.85rem;color:#4ade80;overflow-x:auto}</style></head>
<body><div class="container">
<h1>🎬 YouTube Shorts<br>Auto Publisher</h1>
<p class="subtitle">AI-powered Shorts content pipeline — Vercel Serverless API</p>
<div class="status-grid">
<div class="status-item"><div class="label">OpenAI API</div><div class="value">${process.env.OPENAI_API_KEY ? '<span class="badge badge-green">✓ Configured</span>' : '<span class="badge badge-red">✗ Not Set</span>'}</div></div>
<div class="status-item"><div class="label">Google OAuth</div><div class="value">${(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) ? '<span class="badge badge-green">✓ Configured</span>' : '<span class="badge badge-yellow">Partial</span>'}</div></div>
</div>
<div class="card"><h2>🚀 API Endpoints</h2>
<ul>
<li><code>/api/health</code> — Service health check</li>
<li><code>/api/status</code> — Auth & config status</li>
<li><code>/api/token</code> — Refresh access token</li>
<li><code>/api/auth-url</code> — Get OAuth authorization URL</li>
<li><code>/api/content/generate</code> — AI content generation</li>
<li><code>/api/plugins</code> — List available plugins</li>
<li><code>/api/analytics/summary</code> — Analytics overview</li>
<li><code>/api/gamification/stats</code> — XP, levels, missions</li>
<li><code>/api/queue</code> — Queue status & items</li>
</ul></div>
<div class="card"><h2>💻 Local Development</h2><p>For full functionality (file uploads, transcription, video processing):</p>
<pre>npm install
npm start
# → http://localhost:8788</pre></div>
<div style="margin-top:24px">
<a href="https://github.com/alylmazzz/youtube-shorts-auto-publisher" class="btn btn-secondary">📦 GitHub</a>
<a href="/api/health" class="btn btn-primary">🔍 Health Check</a>
</div>
<div class="footer"><p>YouTube Shorts Auto Publisher v2.1.0 — <a href="https://github.com/alylmazzz/youtube-shorts-auto-publisher">GitHub</a></p></div>
</div></body></html>`);
});

// ── Health ──
app.get('/api/health', (req, res) => {
  res.json({
    ok: true, app: 'YouTube Shorts Auto Publisher', version: '2.1.0',
    mode: 'vercel-serverless', time: new Date().toISOString(),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGoogleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
  });
});

// ── OAuth Status ──
app.get('/api/status', (req, res) => {
  res.json({
    ok: true, hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    mode: 'vercel-serverless', scopes: SCOPES,
    enhancedServices: { hooks: true, plugins: true, queue: true, contentPipeline: true, analytics: true, gamification: true },
  });
});

// ── Token Refresh ──
app.post('/api/token', async (req, res) => {
  try {
    const token = await refreshAccessToken(Boolean(req.body?.force));
    res.json({ ok: true, access_token: token.access_token, token_type: token.token_type, expires_in: token.expires_in, cached: token.cached, scope: token.scope });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Auth URL ──
app.get('/api/auth-url', (req, res) => {
  const clientId = req.query.client_id || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(400).json({ ok: false, error: 'GOOGLE_CLIENT_ID not configured' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', 'https://developers.google.com/oauthplayground');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  res.json({ ok: true, url: url.toString(), scopes: SCOPES });
});

// ── Config Save ──
app.post('/api/config', (req, res) => {
  res.json({
    ok: true, mode: 'vercel-serverless',
    message: 'Configuration is managed via environment variables on Vercel. Update them in the Vercel dashboard.',
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
  });
});

// ── Content Generation ──
app.post('/api/content/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const transcript = body.transcript || body.text || body.videoName || '';
    if (!transcript) return res.status(400).json({ ok: false, error: 'transcript, text, veya videoName gerekli' });

    const openai = getOpenAI();
    const language = body.language || 'tr';
    const style = body.style || 'clickbait';
    let result;

    if (openai) {
      const model = body.modelTier === 'smart' ? 'gpt-4o' : 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `YouTube Shorts SEO expert. Language: ${language}. Generate JSON with: titles (8 options, 60-80 chars, emoji + number), description (200-500 chars with hashtags), tags (18-30, 500 chars), category, seoScore. Style: ${style}.` },
          { role: 'user', content: transcript.slice(0, 3500) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      result = { titles: parsed.titles || [], description: parsed.description || '', tags: parsed.tags || [], category: parsed.category || '22', seoScore: parsed.seoScore || 75, modelUsed: model, pipeline: 'ai' };
    } else {
      const fallbackTitle = transcript.split(' ').slice(0, 5).join(' ') || 'Shorts';
      const year = new Date().getFullYear();
      result = {
        titles: [
          { text: `🔥 ${fallbackTitle} - Bunu Kimse Bilmiyor!`, score: 85 },
          { text: `😱 ${fallbackTitle} Hakkında Şok Edici Gerçek!`, score: 82 },
          { text: `${fallbackTitle} İçin En İyi Yöntem (${year})`, score: 78 },
        ],
        description: `${fallbackTitle} hakkında kısa ve etkili bir Shorts.\\n\\nYorumlara fikrini yaz! 👇\\n\\n#shorts #viral #${fallbackTitle.replace(/\\s+/g, '')}`,
        tags: ['shorts', 'viral', 'trend', fallbackTitle.toLowerCase().replace(/\\s+/g, '')],
        category: '22', seoScore: 65, modelUsed: 'fallback-template', pipeline: 'fallback',
      };
    }
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Content History ──
app.get('/api/content/history', (req, res) => {
  res.json({ ok: true, items: [], message: 'History is stored locally. Run the local server for full persistence.' });
});

// ── Content Feedback ──
app.post('/api/content/feedback', (req, res) => {
  res.json({ ok: true, message: 'Feedback received. For persistent tracking, use the local server.' });
});

// ── Queue ──
app.get('/api/queue', (req, res) => {
  res.json({ ok: true, stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, isProcessing: false, currentJob: null }, items: [], message: 'Queue is managed locally.' });
});
app.post('/api/queue', (req, res) => {
  res.json({ ok: true, job: null, message: 'Queue management requires the local server.' });
});

// ── Plugins ──
app.get('/api/plugins', (req, res) => {
  res.json({ ok: true, plugins: [
    { name: 'auto-hashtag', version: '1.1.0', description: 'Trend, kategori ve Shorts uyumlu hashtagleri otomatik birleştirir.', enabled: true },
    { name: 'sentiment-analysis', version: '1.1.0', description: 'Transkript duygu sinyalini çıkarır ve başlık/thumbnail için emoji tonu önerir.', enabled: true },
    { name: 'watermark', version: '1.0.0', description: 'Video watermark overlay via FFmpeg.', enabled: true },
  ], hookPoints: ['video:beforeImport', 'video:afterImport', 'video:beforeUpload', 'video:afterUpload', 'token:beforeRefresh', 'queue:itemAdded', 'system:startup'] });
});

// ── Analytics ──
app.get('/api/analytics/summary', (req, res) => {
  res.json({ ok: true, summary: { days: Number(req.query.days || 30), totalEvents: 0, uploads: 0, failures: 0, seoGenerated: 0, successRate: 0, views: 0, likes: 0, daily: [], lastEvents: [] }, message: 'Analytics data stored locally.' });
});
app.post('/api/analytics/event', (req, res) => {
  res.json({ ok: true, event: { id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, eventType: req.body.eventType || 'custom', createdAt: new Date().toISOString() } });
});

// ── Gamification ──
app.get('/api/gamification/stats', (req, res) => {
  res.json({ ok: true, stats: { profile: { level: 1, xp: 0, streak: 0, lastPublishDate: null, badges: [], nextLevelXp: 500, levelProgressPct: 0 }, missions: [
    { id: 'first_upload', title: 'İlk Shorts Yayını', target: 1, metric: 'uploads', rewardXp: 100, completed: false, progress: 0 },
    { id: 'three_day_streak', title: '3 Günlük Seri', target: 3, metric: 'streak', rewardXp: 250, completed: false, progress: 0 },
    { id: 'seo_master', title: 'SEO Ustası', target: 10, metric: 'seoGenerated', rewardXp: 150, completed: false, progress: 0 },
  ], recentAchievements: [] }, message: 'Gamification data stored locally.' });
});

// ── Notifications ──
app.get('/api/notifications', (req, res) => {
  res.json({ ok: true, notifications: [], message: 'Notifications stored locally.' });
});

// ── Transcription (local-only) ──
app.post('/transcribe', (req, res) => {
  res.status(400).json({ ok: false, error: 'File upload transcription requires the local server.', localSetup: 'npm install && npm start → http://localhost:8788/transcribe' });
});
app.get('/api/transcribe/capabilities', (req, res) => {
  res.json({ ok: true, tiers: { maximum: 'gpt-4o-transcribe', balanced: 'gpt-4o-mini-transcribe-2025-12-15', economy: 'gpt-4o-mini-transcribe' }, defaultTier: 'maximum', localOnly: true });
});

// ── Pipeline ──
app.post('/api/pipeline/prepare', async (req, res) => {
  res.json({ ok: true, session: { id: `pipe_${Date.now().toString(36)}`, status: 'local-only', message: 'Full pipeline requires the local server with file system access.' } });
});

// ── Export ──
export default app;
