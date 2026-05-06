// ──────────────────────────────────────────────────────
// YouTube Shorts Auto Publisher — Vercel Serverless API
// Full panel-compatible single entry point
// ──────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

let cachedToken = null;

async function refreshAccessToken(force = false) {
  const now = Date.now();
  if (!force && cachedToken?.access_token && cachedToken.expiresAt - now > 120000)
    return { ...cachedToken, cached: true, expires_in: Math.floor((cachedToken.expiresAt - now) / 1000) };
  const cid = process.env.GOOGLE_CLIENT_ID;
  const cs = process.env.GOOGLE_CLIENT_SECRET;
  const rt = process.env.GOOGLE_REFRESH_TOKEN;
  if (!cid || !cs || !rt) throw new Error('Google OAuth credentials not configured.');
  const body = new URLSearchParams({ client_id: cid, client_secret: cs, refresh_token: rt, grant_type: 'refresh_token' });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  cachedToken = { access_token: data.access_token, token_type: data.token_type || 'Bearer', scope: data.scope || '', expires_in: data.expires_in || 3600, expiresAt: Date.now() + ((data.expires_in || 3600) * 1000), cached: false };
  return { ...cachedToken, cached: false };
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

// ── Root / — redirect to panel ──
app.get('/', (req, res) => {
  res.redirect('/panel.html');
});

// ── Health ──
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'YouTube Shorts Auto Publisher', version: '2.1.0', mode: 'vercel-serverless', time: new Date().toISOString(), hasOpenAI: Boolean(process.env.OPENAI_API_KEY), hasGoogleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) });
});

// ── Status ──
app.get('/api/status', (req, res) => {
  res.json({ ok: true, hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID), hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET), hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN), hasOpenAI: Boolean(process.env.OPENAI_API_KEY), driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '', mode: 'vercel-serverless', scopes: SCOPES, enhancedServices: { hooks: true, plugins: true, queue: true, contentPipeline: true, analytics: true, gamification: true } });
});

// ── Token Refresh (/api/token and /api/local-oauth/token) ──
app.post('/api/token', tokenHandler);
app.post('/api/local-oauth/token', tokenHandler);
async function tokenHandler(req, res) {
  try {
    const token = await refreshAccessToken(Boolean(req.body?.force));
    res.json({ ok: true, access_token: token.access_token, token_type: token.token_type, expires_in: token.expires_in, cached: token.cached, scope: token.scope });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
}

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

// ── Config Save (POST /api/local-oauth/save) ──
app.post('/api/local-oauth/save', (req, res) => {
  res.json({
    ok: true, mode: 'vercel-serverless',
    message: 'Configuration is managed via environment variables on Vercel.',
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
    if (!transcript) return res.status(400).json({ ok: false, error: 'transcript gerekli' });
    const openai = getOpenAI();
    const language = body.language || 'tr';
    const style = body.style || 'clickbait';
    let result, aiAnalysis;
    if (openai) {
      const model = body.modelTier === 'smart' ? 'gpt-4o' : 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `YouTube Shorts SEO expert. Language: ${language}. Generate JSON with: titles (8 options, 60-80 chars, emoji + number), description (200-500 chars with hashtags), tags (18-30, 500 chars), category, seoScore (0-100). Style: ${style}.` },
          { role: 'user', content: transcript.slice(0, 3500) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      aiAnalysis = { mainTopic: transcript.split(' ').slice(0, 10).join(' '), contentType: style, sentiment: 'positive' };
      result = { titles: parsed.titles || [], description: parsed.description || '', tags: parsed.tags || [], category: parsed.category || '22', seoScore: { percentage: parsed.seoScore || 75 }, modelUsed: model, pipeline: 'ai', readyToCopy: { title: (Array.isArray(parsed.titles) ? parsed.titles[0]?.text : parsed.titles) || '', description: parsed.description || '' }, sessionId: `content_${Date.now().toString(36)}` };
    } else {
      const fallbackTitle = transcript.split(' ').slice(0, 5).join(' ') || 'Shorts';
      const year = new Date().getFullYear();
      aiAnalysis = { mainTopic: fallbackTitle, contentType: 'general', sentiment: 'neutral' };
      result = { titles: [{ text: `🔥 ${fallbackTitle} - Bunu Kimse Bilmiyor!`, score: 85, charCount: fallbackTitle.length + 30, type: 'clickbait' }, { text: `😱 ${fallbackTitle} Hakkında Şok Edici Gerçek!`, score: 82 }], description: `${fallbackTitle} hakkında kısa ve etkili bir Shorts.\\n\\nYorumlara fikrini yaz! 👇\\n\\n#shorts #viral #${fallbackTitle.replace(/\\s+/g, '')}`, tags: { list: ['shorts', 'viral', 'trend', fallbackTitle.toLowerCase().replace(/\\s+/g, '')], totalChars: 80 }, category: { id: '22', name: 'İnsanlar & Bloglar' }, seoScore: { percentage: 65, label: '⭐ Orta' }, modelUsed: 'fallback-template', pipeline: 'fallback', readyToCopy: { title: `🔥 ${fallbackTitle} - Bunu Kimse Bilmiyor!`, description: `${fallbackTitle} hakkında kısa ve etkili bir Shorts.` }, sessionId: `content_${Date.now().toString(36)}` };
    }
    const fullResult = { ...result, aiAnalysis };
    res.json({ ok: true, result: fullResult });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Content History ──
app.get('/api/content/history', (req, res) => {
  res.json({ ok: true, items: [] });
});
app.get('/api/content/cost-report', (req, res) => {
  res.json({ ok: true, report: { totalCost: 0, totalTokens: 0, sessions: 0, days: Number(req.query.days || 30) }, items: [] });
});
app.post('/api/content/feedback', (req, res) => {
  res.json({ ok: true, message: 'Feedback received.' });
});

// ── Pipeline ──
app.post('/api/pipeline/prepare', async (req, res) => {
  const body = req.body || {};
  const content = await (async () => {
    const transcript = body.transcript || body.videoName || '';
    if (!transcript) return null;
    const openai = getOpenAI();
    if (openai) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'YouTube SEO. JSON: {titles:[],description:"",tags:[],seoScore:0}' }, { role: 'user', content: transcript.slice(0, 3000) }],
        response_format: { type: 'json_object' }, temperature: 0.7
      });
      return JSON.parse(response.choices[0].message.content);
    }
    return { titles: [{ text: transcript.slice(0, 40) }], description: transcript.slice(0, 200), tags: ['shorts'], seoScore: 50 };
  })();
  res.json({ ok: true, session: { id: `pipe_${Date.now().toString(36)}`, status: 'completed', content, videoReport: null, queuedJob: null, completedAt: new Date().toISOString() } });
});
app.get('/api/pipeline/sessions', (req, res) => {
  res.json({ ok: true, sessions: [] });
});

// ── Video ──
app.post('/api/video/analyze', (req, res) => {
  res.json({ ok: true, report: { id: `video_${Date.now().toString(36)}`, fileName: req.body?.videoName || 'unknown', exists: false, quality: { score: 0 }, shorts: { ok: false, errors: ['Video analysis requires local server with FFmpeg.'] }, warnings: ['Vercel serverless does not support FFmpeg. Run locally for full video processing.'] } });
});
app.post('/api/video/process-shorts', (req, res) => {
  res.json({ ok: true, job: { id: `process_${Date.now().toString(36)}`, status: 'local-only', message: 'Video processing requires local server with FFmpeg.' } });
});
app.get('/api/video/reports', (req, res) => {
  res.json({ ok: true, reports: [] });
});

// ── Queue ──
app.get('/api/queue', (req, res) => {
  const status = req.query.status || 'all';
  res.json({ ok: true, stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, uploadedToday: 0, uploadedThisWeek: 0, isProcessing: false, currentJob: null }, items: [] });
});
app.post('/api/queue', (req, res) => {
  res.json({ ok: true, job: null, stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 } });
});
app.post('/api/queue/batch', (req, res) => {
  res.json({ ok: true, jobs: [], stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 } });
});
app.post('/api/queue/:id/retry', (req, res) => {
  res.json({ ok: false, error: 'Queue management requires local server.' });
});
app.post('/api/queue/:id/priority', (req, res) => {
  res.json({ ok: false, error: 'Queue management requires local server.' });
});
app.delete('/api/queue/:id', (req, res) => {
  res.json({ ok: false, error: 'Queue management requires local server.' });
});

// ── Plugins ──
app.get('/api/plugins', (req, res) => {
  res.json({ ok: true, plugins: [
    { name: 'auto-hashtag', version: '1.1.0', description: 'Trend, kategori ve Shorts uyumlu hashtagleri otomatik birleştirir.', enabled: true, loadedAt: new Date().toISOString(), hookCount: 2 },
    { name: 'sentiment-analysis', version: '1.1.0', description: 'Transkript duygu sinyalini çıkarır ve başlık/thumbnail için emoji tonu önerir.', enabled: true, loadedAt: new Date().toISOString(), hookCount: 2 },
    { name: 'watermark', version: '1.0.0', description: 'Video watermark overlay via FFmpeg (local only).', enabled: true, loadedAt: new Date().toISOString(), hookCount: 1 },
  ], logs: [], hookPoints: ['video:beforeImport', 'video:afterImport', 'video:beforeUpload', 'video:afterUpload', 'token:beforeRefresh', 'queue:itemAdded', 'system:startup'] });
});
app.post('/api/plugins/:name/toggle', (req, res) => {
  res.json({ ok: true, plugin: { name: req.params.name, enabled: Boolean(req.body.enabled) } });
});
app.get('/api/hooks/logs', (req, res) => {
  res.json({ ok: true, logs: [] });
});

// ── Analytics ──
app.get('/api/analytics/summary', (req, res) => {
  res.json({ ok: true, summary: { days: Number(req.query.days || 30), totalEvents: 0, uploads: 0, failures: 0, seoGenerated: 0, successRate: 0, views: 0, likes: 0, daily: [], lastEvents: [] } });
});
app.post('/api/analytics/event', (req, res) => {
  res.json({ ok: true, event: { id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, eventType: req.body.eventType || 'custom', createdAt: new Date().toISOString() } });
});

// ── Gamification ──
app.get('/api/gamification/stats', (req, res) => {
  res.json({ ok: true, stats: { profile: { level: 1, xp: 0, streak: 0, lastPublishDate: null, badges: [], nextLevelXp: 500, levelProgressPct: 0, xpForLevel: 500 }, missions: [
    { id: 'first_upload', title: 'İlk Shorts Yayını', target: 1, metric: 'uploads', rewardXp: 100, completed: false, progress: 0 },
    { id: 'three_day_streak', title: '3 Günlük Seri', target: 3, metric: 'streak', rewardXp: 250, completed: false, progress: 0 },
    { id: 'seo_master', title: 'SEO Ustası', target: 10, metric: 'seoGenerated', rewardXp: 150, completed: false, progress: 0 },
  ], recentAchievements: [] } });
});
app.post('/api/gamification/xp', (req, res) => {
  res.json({ ok: true, profile: { level: 1, xp: Number(req.body.amount || 0), streak: 0, badges: [] } });
});

// ── Notifications ──
app.get('/api/notifications', (req, res) => {
  res.json({ ok: true, notifications: [] });
});
app.post('/api/notifications', (req, res) => {
  res.json({ ok: true, notification: { id: `note_${Date.now().toString(36)}`, type: req.body.type || 'info', title: req.body.title || '', message: req.body.message || '', read: false, createdAt: new Date().toISOString() } });
});

// ── Transcription (local-only) ──
app.post('/transcribe', (req, res) => {
  res.status(400).json({ ok: false, error: 'Transcription requires the local server with file upload support. Run: npm install && npm start → http://localhost:8788/transcribe' });
});
app.get('/api/transcribe/capabilities', (req, res) => {
  res.json({ ok: true, tiers: { maximum: 'gpt-4o-transcribe', balanced: 'gpt-4o-mini-transcribe-2025-12-15', economy: 'gpt-4o-mini-transcribe' }, defaultTier: 'maximum', description: 'POST /transcribe — multipart file. Requires local server.', localOnly: true });
});

// ── Docs / endpoint list ──
app.get('/api', (req, res) => {
  res.json({ ok: true, app: 'YouTube Shorts Auto Publisher', endpoints: {
    health: 'GET /api/health', status: 'GET /api/status', token: 'POST /api/local-oauth/token',
    authUrl: 'GET /api/auth-url', config: 'POST /api/local-oauth/save',
    contentGenerate: 'POST /api/content/generate', contentHistory: 'GET /api/content/history',
    queue: 'GET/POST /api/queue', plugins: 'GET /api/plugins',
    analytics: 'GET /api/analytics/summary', gamification: 'GET /api/gamification/stats',
    notifications: 'GET /api/notifications', transcribeCapabilities: 'GET /api/transcribe/capabilities'
  }, envStatus: { openai: Boolean(process.env.OPENAI_API_KEY), googleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) } });
});

export default app;
