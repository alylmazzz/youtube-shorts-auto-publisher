// ──────────────────────────────────────────────────────
// Vercel Serverless Entry — express app bridge
// ──────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let app;

function getApp() {
  if (app) return app;

  app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve static from root (for the HTML panel)
  app.use(express.static(ROOT));

  // ── API Routes ──
  app.get('/api/health', (await import('./health.js')).default);
  app.get('/api/local-oauth/status', (await import('./status.js')).default);
  app.post('/api/local-oauth/save', (await import('./config.js')).default.save);
  app.get('/api/local-oauth/auth-url', (await import('./config.js')).default.authUrl);
  app.post('/api/local-oauth/token', (await import('./token.js')).default);
  app.get('/api/content/history', (await import('./content.js')).default.history);
  app.post('/api/content/generate', (await import('./content.js')).default.generate);
  app.post('/api/content/feedback', (await import('./content.js')).default.feedback);
  app.get('/api/queue', (await import('./queue.js')).default.list);
  app.post('/api/queue', (await import('./queue.js')).default.add);
  app.get('/api/plugins', (await import('./plugins.js')).default);
  app.get('/api/analytics/summary', (await import('./analytics.js')).default.summary);
  app.post('/api/analytics/event', (await import('./analytics.js')).default.track);
  app.get('/api/gamification/stats', (await import('./gamification.js')).default);
  app.get('/api/notifications', (await import('./notifications.js')).default);
  app.get('/api/transcribe/capabilities', (await import('./transcribe.js')).default.capabilities);
  app.post('/transcribe', (await import('./transcribe.js')).default.transcribe);
  app.get('/', (await import('./root.js')).default);

  return app;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
