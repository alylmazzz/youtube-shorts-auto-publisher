// ─────────────────────────────────────────────────
// Token refresh — POST /api/local-oauth/token
// ─────────────────────────────────────────────────
let cachedToken = null;

export default async function handler(req, res) {
  try {
    const now = Date.now();

    // Use cache if still valid (within 2 min expiry buffer)
    if (cachedToken?.access_token && cachedToken.expiresAt - now > 120000) {
      return res.json({
        ok: true,
        access_token: cachedToken.access_token,
        token_type: cachedToken.token_type,
        expires_in: Math.max(0, Math.floor((cachedToken.expiresAt - now) / 1000)),
        cached: true,
        scope: cachedToken.scope,
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({
        ok: false,
        error: 'Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in environment.',
      });
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok || !data.access_token) {
      return res.status(500).json({
        ok: false,
        error: data.error_description || data.error || `Google token refresh failed HTTP ${tokenRes.status}`,
      });
    }

    cachedToken = {
      access_token: data.access_token,
      token_type: data.token_type || 'Bearer',
      scope: data.scope || '',
      expires_in: data.expires_in || 3600,
      expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
      cached: false,
    };

    res.json({
      ok: true,
      access_token: cachedToken.access_token,
      token_type: cachedToken.token_type,
      expires_in: Math.max(0, Math.floor((cachedToken.expiresAt - Date.now()) / 1000)),
      cached: false,
      scope: cachedToken.scope,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
