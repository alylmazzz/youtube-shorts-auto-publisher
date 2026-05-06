// ─────────────────────────────────────────────────
// GET /api/health — Service health check
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  res.json({
    ok: true,
    app: 'YouTube Shorts Auto Publisher',
    version: '2.1.0',
    mode: process.env.VERCEL ? 'vercel-serverless' : 'local',
    time: new Date().toISOString(),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGoogleAuth: Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    ),
    endpoints: {
      health: 'GET /api/health',
      status: 'GET /api/local-oauth/status',
      save: 'POST /api/local-oauth/save',
      authUrl: 'GET /api/local-oauth/auth-url',
      token: 'POST /api/local-oauth/token',
      contentGenerate: 'POST /api/content/generate',
      contentHistory: 'GET /api/content/history',
      contentFeedback: 'POST /api/content/feedback',
      queue: 'GET/POST /api/queue',
      plugins: 'GET /api/plugins',
      analytics: 'GET /api/analytics/summary',
      gamification: 'GET /api/gamification/stats',
      notifications: 'GET /api/notifications',
      transcribe: 'POST /transcribe',
      transcribeCapabilities: 'GET /api/transcribe/capabilities',
    }
  });
}
