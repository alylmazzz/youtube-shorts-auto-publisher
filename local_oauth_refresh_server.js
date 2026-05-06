import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import HookEngine from './hooks/hookEngine.js';
import ContentPipeline from './services/contentPipeline.js';
import VideoProcessor from './services/videoProcessor.js';
import QueueManager from './queue/queueManager.js';
import AnalyticsEngine from './services/analyticsEngine.js';
import GamificationEngine from './services/gamification.js';
import NotificationManager from './services/notificationManager.js';
import PipelineManager from './services/pipelineManager.js';
import {
  buildTranscriptionPrompt,
  resolveTranscriptionModel,
  runTranscription,
  TRANSCRIPTION_TIER_MODELS,
} from './services/transcriptionPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 8788);
const CONFIG_PATH = path.join(process.cwd(), '.youtube_oauth_local.json');
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

let cachedToken = null;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(process.cwd()));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const safe = String(file.originalname || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

const hooks = new HookEngine({ dataDir: DATA_DIR, pluginDir: path.join(process.cwd(), 'plugins') });
await hooks.loadBundledPlugins();
const contentPipeline = new ContentPipeline({ dataDir: DATA_DIR, hooks });
const videoProcessor = new VideoProcessor({ dataDir: DATA_DIR, hooks });
const queueManager = new QueueManager({ dataDir: DATA_DIR, hooks });
const analyticsEngine = new AnalyticsEngine({ dataDir: DATA_DIR, hooks });
const gamification = new GamificationEngine({ dataDir: DATA_DIR, hooks });
const notificationManager = new NotificationManager({ dataDir: DATA_DIR });
const pipelineManager = new PipelineManager({
  contentPipeline,
  videoProcessor,
  queueManager,
  analytics: analyticsEngine,
  gamification,
  hooks,
  dataDir: DATA_DIR,
});

function initContentOpenAIIfAvailable() {
  const config = readConfig();
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (apiKey) contentPipeline.initOpenAI(apiKey);
  return Boolean(apiKey);
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeConfig(next) {
  const current = readConfig();
  const merged = { ...current, ...next, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch {}
  return merged;
}

function publicStatus(config = readConfig()) {
  const now = Date.now();
  return {
    ok: true,
    hasClientId: Boolean(config.clientId || process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(config.clientSecret || process.env.GOOGLE_CLIENT_SECRET),
    hasRefreshToken: Boolean(config.refreshToken || process.env.GOOGLE_REFRESH_TOKEN),
    hasOpenAI: Boolean(config.openaiApiKey || process.env.OPENAI_API_KEY),
    driveFolderId: config.driveFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    tokenCached: Boolean(cachedToken?.access_token && cachedToken.expiresAt > now),
    tokenExpiresIn: cachedToken?.expiresAt ? Math.max(0, Math.floor((cachedToken.expiresAt - now) / 1000)) : 0,
    configFile: CONFIG_PATH,
    enhancedServices: { hooks: true, plugins: true, queue: true, contentPipeline: true, videoProcessor: true, analytics: true, gamification: true },
    scopes: SCOPES,
  };
}

function requiredOAuthConfig() {
  const config = readConfig();
  const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = config.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID / clientId yok');
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET / clientSecret yok');
  if (!refreshToken) throw new Error('GOOGLE_REFRESH_TOKEN / refreshToken yok');
  return { config, clientId, clientSecret, refreshToken };
}

async function refreshAccessToken(force = false) {
  const now = Date.now();
  if (!force && cachedToken?.access_token && cachedToken.expiresAt - now > 120000) {
    return { ...cachedToken, cached: true, expires_in: Math.floor((cachedToken.expiresAt - now) / 1000) };
  }
  const { clientId, clientSecret, refreshToken } = requiredOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token refresh failed HTTP ${res.status}`);
  }
  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type || 'Bearer',
    scope: data.scope || '',
    expires_in: data.expires_in || 3600,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
    cached: false,
  };
  return { ...cachedToken, cached: false };
}

app.get('/', (req, res) => {
  const htmlFiles = fs.readdirSync(process.cwd()).filter(f => f.toLowerCase().endsWith('.html'));
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Local OAuth Server</title><body style="font-family:system-ui;background:#111;color:#eee;padding:24px"><h1>Local OAuth Refresh Server çalışıyor</h1><p>Port: ${PORT}</p><p>Config: ${CONFIG_PATH}</p><h2>HTML dosyaları</h2><ul>${htmlFiles.map(f => `<li><a style="color:#8fd3ff" href="/${encodeURIComponent(f)}">${f}</a></li>`).join('')}</ul><h2>Endpointler</h2><pre>GET  /api/local-oauth/status\nPOST /api/local-oauth/save\nPOST /api/local-oauth/token\nGET  /api/local-oauth/auth-url\nPOST /transcribe\nGET  /api/transcribe/capabilities</pre></body>`);
});

app.get('/api/local-oauth/status', (req, res) => res.json(publicStatus()));

app.post('/api/local-oauth/save', (req, res) => {
  const body = req.body || {};
  const allowed = {};
  for (const [from, to] of [
    ['clientId', 'clientId'],
    ['clientSecret', 'clientSecret'],
    ['refreshToken', 'refreshToken'],
    ['driveFolderId', 'driveFolderId'],
    ['openaiApiKey', 'openaiApiKey'],
    ['transcriptionModel', 'transcriptionModel'],
    ['transcriptionDefaultTier', 'transcriptionDefaultTier'],
    ['transcriptionPrompt', 'transcriptionPrompt'],
    ['transcriptionGlossary', 'transcriptionGlossary'],
  ]) {
    if (typeof body[from] === 'string' && body[from].trim()) allowed[to] = body[from].trim();
  }
  if (!Object.keys(allowed).length) return res.status(400).json({ ok: false, error: 'Kaydedilecek alan yok' });
  const saved = writeConfig(allowed);
  cachedToken = null;
  res.json(publicStatus(saved));
});

app.post('/api/local-oauth/token', async (req, res) => {
  try {
    const token = await refreshAccessToken(Boolean(req.body?.force));
    res.json({
      ok: true,
      access_token: token.access_token,
      token_type: token.token_type,
      expires_in: Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000)),
      cached: token.cached,
      scope: token.scope,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/local-oauth/auth-url', (req, res) => {
  try {
    const config = readConfig();
    const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID || req.query.client_id;
    if (!clientId) return res.status(400).json({ ok: false, error: 'Önce clientId kaydet veya client_id query param gönder.' });
    const redirectUri = `http://localhost:${PORT}/oauth2callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    res.json({ ok: true, url: url.toString(), redirectUri, scopes: SCOPES });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/oauth2callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) throw new Error('code parametresi yok');
    const config = readConfig();
    const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Önce clientId ve clientSecret kaydedilmeli.');
    const redirectUri = `http://localhost:${PORT}/oauth2callback`;
    const body = new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(data.error_description || data.error || 'Code exchange failed');
    if (data.refresh_token) writeConfig({ refreshToken: data.refresh_token });
    cachedToken = data.access_token ? {
      access_token: data.access_token,
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in || 3600,
      expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
      scope: data.scope || '',
      cached: false,
    } : null;
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#111;color:#eee;padding:24px"><h1>OAuth tamamlandı</h1><p>${data.refresh_token ? 'Refresh token kaydedildi.' : 'Refresh token dönmedi. Daha önce izin verdiysen Google Account > Security > Third-party access kısmından uygulamayı kaldırıp tekrar dene veya OAuth Playground kullan.'}</p><p>Bu sekmeyi kapatıp HTML paneline dönebilirsin.</p></body>`);
  } catch (e) {
    res.status(500).type('html').send(`<pre>OAuth callback hatası: ${String(e.message).replace(/[<>&]/g, '')}</pre>`);
  }
});

app.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    const config = readConfig();
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY veya openaiApiKey yok' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'file alanı gerekli' });
    const openai = new OpenAI({ apiKey });

    const body = req.body || {};
    const langRaw = body.language != null && String(body.language).trim() !== ''
      ? String(body.language).trim().toLowerCase()
      : '';
    const language = langRaw === 'auto' || !langRaw ? undefined : langRaw;

    const tier = String(body.transcriptionTier || body.tier || config.transcriptionDefaultTier || process.env.TRANSCRIBE_TIER || 'maximum').toLowerCase();
    const explicitModel = body.model || config.transcriptionModel || process.env.TRANSCRIBE_MODEL || '';
    const model = resolveTranscriptionModel(
      TRANSCRIPTION_TIER_MODELS[tier] ? tier : 'maximum',
      explicitModel,
    );

    const glossary = [body.glossary, body.nicheKeywords, config.transcriptionGlossary]
      .filter((x) => x && String(x).trim())
      .join(', ')
      .slice(0, 2000);
    const channelContext = String(body.channelContext || '').trim() || undefined;

    const customPrompt = body.prompt || body.transcriptionPrompt || config.transcriptionPrompt || '';
    const base = String(body.contentLanguage || body.baseLanguage || (language === 'en' ? 'en' : 'tr') || 'tr').toLowerCase().startsWith('en') ? 'en' : 'tr';

    const prompt = buildTranscriptionPrompt({
      language: language || 'auto',
      glossary,
      channelContext,
      customPrompt,
      base,
    });

    const temperature = body.temperature !== undefined && body.temperature !== ''
      ? Math.min(1, Math.max(0, Number(body.temperature)))
      : 0;
    const longAudioChunking = String(body.longAudioChunking || 'true').toLowerCase() !== 'false';

    const inputFile = await toFile(req.file.buffer, req.file.originalname || 'video.mp4', { type: req.file.mimetype || 'video/mp4' });

    const result = await runTranscription(openai, {
      file: inputFile,
      model,
      language,
      prompt,
      temperature,
      longAudioChunking,
    });

    res.json({
      ok: true,
      text: result.text || '',
      transcript: result.transcript || result.text || '',
      model: result.model,
      tier: TRANSCRIPTION_TIER_MODELS[tier] ? tier : 'maximum',
      pipeline: result.pipeline,
      segments: result.segments,
      duration: result.duration,
      warning: result.warning,
      roles: [
        'Broadcast Transcription Editor',
        'ASR Quality & Completeness Gatekeeper',
        'Turkish/English Orthography Specialist',
        'YouTube Shorts Speech Pipeline',
      ],
      raw: result.raw,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/transcribe/capabilities', (req, res) => {
  res.json({
    ok: true,
    tiers: TRANSCRIPTION_TIER_MODELS,
    description: 'POST /transcribe — multipart file alanı "file". Opsiyonel: language (tr|en|auto), transcriptionTier (maximum|balanced|economy), glossary, channelContext, prompt, model, temperature 0-1, longAudioChunking true|false',
    defaultTier: 'maximum',
  });
});


// ═══════════════════════════════════════════════════════════════
// GELİŞMİŞ OTOMASYON ENDPOINTLERİ
// ═══════════════════════════════════════════════════════════════
app.get('/health', async (req, res) => {
  const config = readConfig();
  res.json({
    ok: true,
    app: 'YouTube Shorts Auto Publisher',
    version: '2.0.0-enhanced',
    time: new Date().toISOString(),
    hasOpenAI: Boolean(config.openaiApiKey || process.env.OPENAI_API_KEY),
    services: publicStatus(config).enhancedServices,
    plugins: hooks.listPlugins(),
    queue: queueManager.getStats(),
  });
});

app.post('/api/content/generate', async (req, res) => {
  try {
    initContentOpenAIIfAvailable();
    const body = req.body || {};
    const result = await contentPipeline.generateFullContent(body.transcript || body.text || body.videoName || '', {
      language: body.language || body.options?.language || 'tr',
      category: body.category || body.options?.category || 'general',
      style: body.style || body.options?.style || 'clickbait',
      descriptionStyle: body.descriptionStyle || body.options?.descriptionStyle || 'standard',
      ctaStyle: body.ctaStyle || body.options?.ctaStyle || 'Yoruma tek kelime yaz 👇',
      channelContext: body.channelContext || body.options?.channelContext || '',
      channelId: body.channelId || body.options?.channelId || 'default',
      modelTier: body.modelTier || body.options?.modelTier || 'fast',
      videoName: body.videoName || '',
      nicheKeywords: body.nicheKeywords || body.options?.nicheKeywords || '',
    });
    await analyticsEngine.track('seo_generated', { sessionId: result.sessionId, title: result.readyToCopy.title, seoScore: result.seoScore.percentage });
    gamification.onSeoGenerated();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/content/history', (req, res) => {
  res.json({ ok: true, items: contentPipeline.getHistory(Number(req.query.limit || 50)) });
});

app.get('/api/content/cost-report', (req, res) => {
  res.json({ ok: true, report: contentPipeline.getCostReport(Number(req.query.days || 30)) });
});

app.post('/api/content/feedback', (req, res) => {
  try {
    contentPipeline.updatePerformanceFeedback(req.body.videoId || req.body.sessionId, req.body.metrics || req.body);
    if (req.body.metrics) queueManager.learnOptimalTime(req.body.publishedAt || new Date(), req.body.metrics);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/pipeline/prepare', async (req, res) => {
  try {
    initContentOpenAIIfAvailable();
    const session = await pipelineManager.prepareUpload(req.body || {});
    res.json({ ok: true, session });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/pipeline/sessions', (req, res) => {
  res.json({ ok: true, sessions: pipelineManager.getSessions(Number(req.query.limit || 30)) });
});

app.post('/api/video/analyze', diskUpload.single('file'), async (req, res) => {
  try {
    const metadata = req.body?.metadata ? JSON.parse(req.body.metadata) : (req.body || {});
    const filePath = req.file?.path || req.body?.videoPath || '';
    const report = await videoProcessor.analyzeFile(filePath, { ...metadata, originalName: req.file?.originalname || req.body?.videoName });
    res.json({ ok: true, report });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/video/process-shorts', async (req, res) => {
  try {
    const job = await videoProcessor.processShorts(req.body.inputPath, req.body.options || {});
    res.json({ ok: true, job });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/video/reports', (req, res) => {
  res.json({ ok: true, reports: videoProcessor.getRecentReports(Number(req.query.limit || 30)) });
});

app.get('/api/plugins', (req, res) => {
  res.json({ ok: true, plugins: hooks.listPlugins(), logs: hooks.getLogs(50), hookPoints: hooks.hookPoints });
});

app.post('/api/plugins/:name/toggle', (req, res) => {
  try {
    const plugin = hooks.setPluginEnabled(req.params.name, Boolean(req.body.enabled));
    res.json({ ok: true, plugin });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

app.get('/api/hooks/logs', (req, res) => {
  res.json({ ok: true, logs: hooks.getLogs(Number(req.query.limit || 100)) });
});

app.get('/api/queue', (req, res) => {
  res.json({ ok: true, stats: queueManager.getStats(), items: queueManager.getQueue(req.query.status || 'all', Number(req.query.limit || 50), Number(req.query.offset || 0)) });
});

app.post('/api/queue', async (req, res) => {
  try {
    const job = await queueManager.addToQueue(req.body || {});
    gamification.onQueued();
    res.json({ ok: true, job, stats: queueManager.getStats() });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/queue/batch', async (req, res) => {
  try {
    const jobs = await queueManager.addBatch(req.body.items || []);
    jobs.forEach(() => gamification.onQueued());
    res.json({ ok: true, jobs, stats: queueManager.getStats() });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/queue/:id/retry', (req, res) => {
  try { res.json({ ok: true, job: queueManager.retryFailed(req.params.id) }); }
  catch (e) { res.status(404).json({ ok: false, error: e.message }); }
});

app.post('/api/queue/:id/priority', (req, res) => {
  try { res.json({ ok: true, job: queueManager.reorderQueue(req.params.id, req.body.priority) }); }
  catch (e) { res.status(404).json({ ok: false, error: e.message }); }
});

app.delete('/api/queue/:id', (req, res) => {
  try { res.json({ ok: true, removed: queueManager.remove(req.params.id), stats: queueManager.getStats() }); }
  catch (e) { res.status(404).json({ ok: false, error: e.message }); }
});

app.get('/api/analytics/summary', (req, res) => {
  res.json({ ok: true, summary: analyticsEngine.summary(Number(req.query.days || 30)) });
});

app.post('/api/analytics/event', async (req, res) => {
  const event = await analyticsEngine.track(req.body.eventType || 'custom', req.body.payload || {});
  res.json({ ok: true, event });
});

app.get('/api/gamification/stats', (req, res) => {
  res.json({ ok: true, stats: gamification.getStats() });
});

app.post('/api/gamification/xp', (req, res) => {
  res.json({ ok: true, profile: gamification.awardXp(Number(req.body.amount || 0), req.body.reason || 'manual') });
});

app.get('/api/notifications', (req, res) => {
  res.json({ ok: true, notifications: notificationManager.list(Number(req.query.limit || 50)) });
});

app.post('/api/notifications', (req, res) => {
  const n = notificationManager.notify(req.body.type || 'info', req.body.title || 'Bildirim', req.body.message || '', req.body.payload || {});
  res.json({ ok: true, notification: n });
});

app.listen(PORT, () => {
  console.log(`Local OAuth Refresh Server: http://localhost:${PORT}`);
  console.log(`Config file: ${CONFIG_PATH}`);
  console.log('Scope:', SCOPES.join(' '));
});
