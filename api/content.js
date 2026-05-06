// ─────────────────────────────────────────────────
// Content pipeline API — generate, history, feedback
// ─────────────────────────────────────────────────
import OpenAI from 'openai';

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

const handlers = {
  async generate(req, res) {
    try {
      const body = req.body || {};
      const transcript = body.transcript || body.text || body.videoName || '';

      if (!transcript) {
        return res.status(400).json({
          ok: false,
          error: 'transcript, text, veya videoName gerekli',
        });
      }

      const openai = getOpenAI();
      const language = body.language || 'tr';
      const style = body.style || 'clickbait';

      let result;

      if (openai) {
        // AI-powered content generation
        const model = body.modelTier === 'smart' ? 'gpt-4o' : 'gpt-4o-mini';
        const response = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a YouTube Shorts SEO expert. Language: ${language}. Generate content in JSON format with: titles (8 options, 60-80 chars, emoji + number), description (200-500 chars with hashtags), tags (18-30 tags, 500 chars total), category, and seo score. Style: ${style}.`
            },
            { role: 'user', content: transcript.slice(0, 3500) }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        result = {
          titles: parsed.titles || [],
          description: parsed.description || '',
          tags: parsed.tags || [],
          category: parsed.category || '22',
          seoScore: parsed.seoScore || 75,
          modelUsed: model,
          pipeline: 'ai',
        };
      } else {
        // Fallback: template-based content
        const fallbackTitle = transcript.split(' ').slice(0, 5).join(' ') || 'Shorts';
        const year = new Date().getFullYear();
        result = {
          titles: [
            { text: `🔥 ${fallbackTitle} - Bunu Kimse Bilmiyor!`, score: 85 },
            { text: `😱 ${fallbackTitle} Hakkında Şok Edici Gerçek!`, score: 82 },
            { text: `${fallbackTitle} İçin En İyi Yöntem (${year})`, score: 78 },
            { text: `❌ ${fallbackTitle} YAPMA! İşte Gerçek Neden...`, score: 80 },
          ],
          description: `${fallbackTitle} hakkında kısa ve etkili bir Shorts.\n\nYorumlara fikrini yaz! 👇\n\n#shorts #viral #${fallbackTitle.replace(/\\s+/g, '')}`,
          tags: ['shorts', 'viral', 'trend', fallbackTitle.toLowerCase().replace(/\\s+/g, '')],
          category: '22',
          seoScore: 65,
          modelUsed: 'fallback-template',
          pipeline: 'fallback',
        };
      }

      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },

  history(req, res) {
    res.json({
      ok: true,
      items: [],
      message: 'History is stored locally. Run the local server for full history persistence.',
    });
  },

  feedback(req, res) {
    res.json({
      ok: true,
      message: 'Feedback received. For persistent tracking, use the local server.',
    });
  },
};

export default handlers;
