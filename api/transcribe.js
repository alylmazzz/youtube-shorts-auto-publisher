// ─────────────────────────────────────────────────
// Transcription — POST /transcribe
// ─────────────────────────────────────────────────
import OpenAI from 'openai';

const TRANSCRIPTION_TIER_MODELS = {
  maximum: 'gpt-4o-transcribe',
  balanced: 'gpt-4o-mini-transcribe-2025-12-15',
  economy: 'gpt-4o-mini-transcribe',
};

const handlers = {
  async transcribe(req, res) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          ok: false,
          error: 'OPENAI_API_KEY not configured. Set it in environment variables.',
        });
      }

      // File upload not available in Vercel serverless (no disk storage)
      // Check if we have a file or provide instructions
      return res.status(400).json({
        ok: false,
        error: 'File upload transcription requires the local server. Deploy locally at port 8788 for full transcription support.',
        localSetup: 'npm install && npm start # then POST to http://localhost:8788/transcribe',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },

  capabilities(req, res) {
    res.json({
      ok: true,
      tiers: TRANSCRIPTION_TIER_MODELS,
      description: 'POST /transcribe — Requires local server with file upload. Vercel deployment supports config & content API only.',
      defaultTier: 'maximum',
      localOnly: true,
    });
  },
};

export default handlers;
