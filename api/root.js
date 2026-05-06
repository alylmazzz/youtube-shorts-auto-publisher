// ─────────────────────────────────────────────────
// Root — GET / (landing page)
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  res.type('html').send(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YouTube Shorts Auto Publisher</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .container { max-width: 720px; padding: 40px 24px; text-align: center; }
  h1 { font-size: 2.2rem; background: linear-gradient(135deg, #ff4444, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 12px; }
  .subtitle { color: #888; font-size: 1.1rem; margin-bottom: 36px; }
  .card { background: #1a1a1a; border-radius: 16px; padding: 28px; margin-bottom: 20px; text-align: left; border: 1px solid #2a2a2a; }
  .card h2 { font-size: 1.2rem; color: #ff4444; margin-bottom: 12px; }
  .card p, .card li { color: #aaa; line-height: 1.7; font-size: 0.95rem; }
  .card ul { list-style: none; padding: 0; }
  .card ul li::before { content: "› "; color: #ff4444; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; margin: 4px; }
  .badge-green { background: #1a3a1a; color: #4ade80; }
  .badge-red { background: #3a1a1a; color: #f87171; }
  .badge-yellow { background: #3a3a1a; color: #facc15; }
  .btn { display: inline-block; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 8px; transition: all .2s; font-size: 0.95rem; }
  .btn-primary { background: #ff4444; color: #fff; }
  .btn-primary:hover { background: #e03a3a; }
  .btn-secondary { background: #2a2a2a; color: #e0e0e0; border: 1px solid #3a3a3a; }
  .btn-secondary:hover { background: #3a3a3a; }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .status-item { background: #222; border-radius: 10px; padding: 16px; text-align: center; }
  .status-item .label { font-size: 0.8rem; color: #666; margin-bottom: 4px; }
  .status-item .value { font-size: 1rem; font-weight: 600; }
  .footer { margin-top: 32px; font-size: 0.85rem; color: #555; }
  .footer a { color: #ff4444; text-decoration: none; }
  @media (max-width: 480px) { h1 { font-size: 1.6rem; } .status-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">
  <h1>🎬 YouTube Shorts<br>Auto Publisher</h1>
  <p class="subtitle">AI-powered Shorts content pipeline, queue management,<br>analytics & gamification platform</p>

  <div class="status-grid">
    <div class="status-item">
      <div class="label">OpenAI API</div>
      <div class="value">${process.env.OPENAI_API_KEY ? '<span class="badge badge-green">✓ Configured</span>' : '<span class="badge badge-red">✗ Not Set</span>'}</div>
    </div>
    <div class="status-item">
      <div class="label">Google OAuth</div>
      <div class="value">${(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) ? '<span class="badge badge-green">✓ Configured</span>' : '<span class="badge badge-yellow">Partial</span>'}</div>
    </div>
  </div>

  <div class="card">
    <h2>🚀 API Endpoints</h2>
    <ul>
      <li><code>/api/health</code> — Service health check</li>
      <li><code>/api/local-oauth/status</code> — Auth & config status</li>
      <li><code>/api/local-oauth/token</code> — Refresh access token</li>
      <li><code>/api/local-oauth/auth-url</code> — Get OAuth URL</li>
      <li><code>/api/content/generate</code> — AI content generation</li>
      <li><code>/api/plugins</code> — List available plugins</li>
      <li><code>/api/analytics/summary</code> — Analytics overview</li>
      <li><code>/api/gamification/stats</code> — XP, levels, missions</li>
    </ul>
  </div>

  <div class="card">
    <h2>💻 Local Development</h2>
    <p>For full functionality (file uploads, transcription, video processing, persistent queue):</p>
    <pre style="background:#111;padding:12px;border-radius:8px;margin-top:12px;font-size:0.85rem;color:#4ade80;overflow-x:auto;">npm install
npm start
# → http://localhost:8788</pre>
  </div>

  <div style="margin-top: 24px;">
    <a href="https://github.com/alyilmazzz/youtube-shorts-auto-publisher" class="btn btn-secondary" target="_blank">📦 GitHub</a>
    <a href="/api/health" class="btn btn-primary">🔍 Health Check</a>
  </div>

  <div class="footer">
    <p>YouTube Shorts Auto Publisher v2.1.0 — Built with ❤️</p>
    <p><a href="https://github.com/alyilmazzz/youtube-shorts-auto-publisher">GitHub Repository</a></p>
  </div>
</div>
</body>
</html>`);
}
