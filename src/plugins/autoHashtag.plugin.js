export default {
  name: 'auto-hashtag',
  version: '1.1.0',
  description: 'Trend, kategori ve Shorts uyumlu hashtagleri otomatik birleştirir.',
  init(hooks) {
    hooks.register('video:afterTagGenerate', async (context) => {
      const existing = Array.isArray(context.tags?.list) ? context.tags.list : Array.isArray(context.tags) ? context.tags : [];
      const keywords = context.keywords?.all || context.keywords?.primary || [];
      const category = context.category?.name || context.category || 'shorts';
      const language = context.config?.language || context.language || 'tr';
      const trendTags = this.fetchTrendingHashtags(category, language, keywords);
      const merged = this.mergeTags(existing, trendTags, 500);
      if (context.tags?.list) return { ...context, tags: { ...context.tags, list: merged, totalChars: merged.join(',').length } };
      return { ...context, tags: merged };
    }, 5, 'auto-hashtag');

    hooks.register('video:beforeUpload', async (context) => {
      const seo = context.seo || {};
      const sourceTags = seo.topHashtags || context.topHashtags || context.tags || [];
      const hashtags = sourceTags
        .map(t => String(t).startsWith('#') ? String(t) : '#' + String(t).replace(/\s+/g, ''))
        .filter(Boolean)
        .slice(0, 5);
      const description = context.description || seo.description || '';
      if (!hashtags.length || hashtags.every(tag => description.includes(tag))) return context;
      return { ...context, description: `${description}\n\n${hashtags.join(' ')}`.trim() };
    }, 10, 'auto-hashtag');
  },
  fetchTrendingHashtags(category, language, keywords = []) {
    const evergreen = language === 'tr'
      ? ['shorts', 'viral', 'keşfet', 'fyp', 'trend', 'gündem']
      : ['shorts', 'viral', 'fyp', 'trend', 'learn', 'tips'];
    const categoryMap = {
      tech: ['ai', 'teknoloji', 'yapay zeka', 'software'],
      education: ['eğitim', 'öğren', 'nasıl yapılır', 'bilgi'],
      entertainment: ['komedi', 'eğlence', 'funny', 'reaction'],
      fitness: ['fitness', 'motivasyon', 'gains', 'workout'],
      finance: ['para', 'yatırım', 'girişimcilik', 'business']
    };
    const categoryKey = String(category).toLowerCase();
    const matched = Object.entries(categoryMap).find(([key]) => categoryKey.includes(key));
    return [...evergreen, ...(matched ? matched[1] : []), ...keywords.slice(0, 5)];
  },
  mergeTags(existing, trending, maxLength) {
    const combined = [...new Set([...existing, ...trending].map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean))];
    const result = [];
    let totalLength = 0;
    for (const tag of combined) {
      if (totalLength + tag.length + 1 <= maxLength) {
        result.push(tag);
        totalLength += tag.length + 1;
      }
    }
    return result;
  }
};
