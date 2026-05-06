export default {
  name: 'sentiment-analysis',
  version: '1.1.0',
  description: 'Transkript duygu sinyalini çıkarır ve başlık/thumbnail için emoji tonu önerir.',
  init(hooks) {
    hooks.register('video:afterTranscribe', async (context) => {
      const sentiment = this.analyzeSentiment(context.transcript || '');
      const emojiMap = {
        positive: ['🔥', '💪', '🚀', '✨', '😍'],
        negative: ['😱', '⚠️', '🤯', '❌'],
        neutral: ['📌', '💡', '🎯', '✅'],
        funny: ['😂', '🤣', '💀']
      };
      return { ...context, sentiment, suggestedEmojis: emojiMap[sentiment.category] || emojiMap.neutral };
    }, 5, 'sentiment-analysis');

    hooks.register('video:afterTitleGenerate', async (context) => {
      const emoji = context.suggestedEmojis?.[0];
      if (!emoji || !Array.isArray(context.titles)) return context;
      const titles = context.titles.map((title, index) => {
        const text = typeof title === 'string' ? title : title.text;
        if (index === 0 && text && !text.includes(emoji) && !/[🔥😱❌✅💡⚡🚀]/u.test(text)) {
          return typeof title === 'string' ? `${emoji} ${text}` : { ...title, text: `${emoji} ${text}` };
        }
        return title;
      });
      return { ...context, titles };
    }, 8, 'sentiment-analysis');
  },
  analyzeSentiment(text) {
    const source = String(text).toLowerCase('tr-TR');
    const positive = ['başarı', 'kazandım', 'harika', 'mükemmel', 'kolay', 'güzel', 'sev', 'mutlu', 'win', 'best', 'easy'];
    const negative = ['hata', 'yapma', 'kötü', 'kaybet', 'problem', 'risk', 'yanlış', 'tehlike', 'stop', 'wrong'];
    const funny = ['komik', 'gül', 'şaka', '😂', '🤣', 'funny'];
    const p = positive.filter(w => source.includes(w)).length;
    const n = negative.filter(w => source.includes(w)).length;
    const f = funny.filter(w => source.includes(w)).length;
    const category = f ? 'funny' : p > n ? 'positive' : n > p ? 'negative' : 'neutral';
    const score = Math.min(0.99, Math.max(0.35, (Math.max(p, n, f) + 1) / 8));
    return { category, score: Number(score.toFixed(2)), positiveHits: p, negativeHits: n, funnyHits: f };
  }
};
