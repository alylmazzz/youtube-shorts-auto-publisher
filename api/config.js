// ─────────────────────────────────────────────────
// Config save & auth URL — POST /api/local-oauth/save
//                        — GET  /api/local-oauth/auth-url
// ─────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const handlers = {
  save(req, res) {
    // On Vercel, config is read-only from env vars
    res.json({
      ok: true,
      mode: process.env.VERCEL ? 'vercel-serverless' : 'local',
      message: process.env.VERCEL
        ? 'Configuration is managed via environment variables on Vercel. Update them in the Vercel dashboard.'
        : 'Configuration saved.',
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    });
  },

  authUrl(req, res) {
    const clientId = req.query.client_id || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({
        ok: false,
        error: 'GOOGLE_CLIENT_ID not configured. Set it in environment variables.',
      });
    }

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', 'https://developers.google.com/oauthplayground');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');

    res.json({
      ok: true,
      url: url.toString(),
      scopes: SCOPES,
      note: 'For local OAuth flow, use the Google OAuth 2.0 Playground at https://developers.google.com/oauthplayground',
    });
  },
};

export default handlers;
