// ─────────────────────────────────────────────────
// GET /api/local-oauth/status — Auth & config status
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  res.json({
    ok: true,
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    mode: process.env.VERCEL ? 'vercel-serverless' : 'local',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    enhancedServices: {
      hooks: true,
      plugins: true,
      queue: true,
      contentPipeline: true,
      videoProcessor: false,
      analytics: true,
      gamification: true,
    },
  });
}
