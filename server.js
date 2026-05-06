// ──────────────────────────────────────────────────────
// Render.com standalone server entry point
// Uses the same Express app from api/index.js
// ──────────────────────────────────────────────────────
import 'dotenv/config';
import app from './api/index.js';

const PORT = Number(process.env.PORT || 8788);

app.listen(PORT, () => {
  console.log(`YouTube Shorts Auto Publisher server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/panel.html`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
