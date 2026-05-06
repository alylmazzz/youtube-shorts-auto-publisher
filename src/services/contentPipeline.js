import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { JsonStore } from '../utils/jsonStore.js';

export class ContentPipeline {
  constructor({ dataDir, hooks } = {}) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.hooks = hooks || null;
    this.openai = null;
    this.cache = new Map();
    this.rateLimiter = new RateLimiter(60, 60_000);
    this.store = new JsonStore(path.join(this.dataDir, 'content.json'), {
      contentHistory: [],
      keywordPerformance: {},
      titlePatterns: [],
      channelContext: {},
      tokenUsage: [],
      promptTemplates: {},
      rules: []
    });
    this.templates = this.loadTemplates();
  }

  initOpenAI(apiKey) {
    if (!apiKey) return false;
    this.openai = new OpenAI({ apiKey });
    return true;
  }

  setHookEngine(hooks) {
    this.hooks = hooks;
  }

  loadTemplates() {
    return {
      title: {
        tr: {
          clickbait: [
            '🔥 {keyword} - Bunu Kimse Bilmiyor!',
            '😱 {keyword} Hakkında Şok Edici Gerçek!',
            '{keyword} İçin En İyi Yöntem ({year})',
            '❌ {keyword} YAPMA! İşte Gerçek Neden...',
            '✅ {keyword} Nasıl Yapılır? Adım Adım',
            '💡 {keyword} Sırrını Nihayet Öğrendim!',
            '⚠️ {keyword} Konusunda Herkesi Uyarın!',
            '🚀 {keyword} ile Hayatınız Değişecek!'
          ],
          informative: [
            '{keyword}: Bilmeniz Gereken Her Şey',
            '{keyword} Rehberi | {year} Güncel',
            '{keyword} - Başlangıçtan Uzmanlığa',
            '{keyword} Nedir? Nasıl Çalışır?',
            '{keyword} Hakkında {number} Önemli Bilgi'
          ],
          storytelling: [
            '{keyword} Konusunda Bunu Yaşadım...',
            'Bir Gün {keyword} Denedim ve Sonuç Şaşırttı',
            '{keyword} Bana Bunu Öğretti',
            'Kimsenin Anlatmadığı {keyword} Hikayesi'
          ]
        },
        en: {
          clickbait: [
            '🔥 {keyword} - Nobody Talks About This!',
            '😱 The Shocking Truth About {keyword}!',
            'Best Way To {keyword} In {year}',
            '❌ STOP Doing This With {keyword}!',
            '✅ How To {keyword} Step By Step'
          ],
          informative: [
            '{keyword}: Everything You Need To Know',
            'The Complete {keyword} Guide | {year}',
            'What Is {keyword}? Fully Explained'
          ]
        }
      },
      hooks: {
        tr: [
          'Bu videoyu izleyip geçme, hayatını değiştirebilir! 🔥',
          '{keyword} hakkında bilmediğin şeyler seni şaşırtacak...',
          'Son yıllarda öğrendiğim en değerli şeyi paylaşıyorum:',
          'Bunu benden önce kimse söylemedi:',
          'Eğer {keyword} öğrenmek istiyorsan, doğru yerdesin!'
        ],
        en: [
          'This changed everything for me... 🔥',
          'Nobody talks about this {keyword} secret...',
          "Here's what I wish I knew about {keyword}:",
          'Stop scrolling. This is actually important.'
        ]
      },
      description: {
        standard: '{hook}\n\n{summary}\n\n{cta}\n\n{hashtags}\n#shorts #{mainKeyword}',
        detailed: '{hook}\n\n📌 Bu videoda:\n{bullets}\n\n{cta}\n\n{hashtags}\n#shorts #viral #{mainKeyword}',
        minimal: '{hook}\n\n{hashtags}\n#shorts'
      }
    };
  }

  async generateFullContent(transcript, options = {}) {
    const config = this.mergeOptions(options);
    const sessionId = makeId('content');
    const startedAt = Date.now();
    const transcriptText = String(transcript || config.videoName || '').trim();
    const inputHash = this.hashText(transcriptText + JSON.stringify(config));
    const cached = this.getFromCache(inputHash);
    if (cached) return { ...cached, cacheHit: true };

    let context = { sessionId, transcript: transcriptText, config, startedAt };
    if (this.hooks) context = await this.hooks.execute('video:beforeTitleGenerate', context);

    const model = config.modelTier === 'smart' ? 'gpt-4o' : 'gpt-4o-mini';
    const canUseAi = Boolean(this.openai && transcriptText);

    let analysis;
    let keywords;
    let titles;
    let hooks;
    let description;
    let tags;
    let thumbnail;

    if (canUseAi) {
      await this.rateLimiter.wait();
      analysis = await this.safeAi(() => this.analyzeTranscript(transcriptText, config.language, model), () => this.fallbackAnalysis(transcriptText, config));
      keywords = await this.safeAi(() => this.extractKeywords(transcriptText, config.language, analysis, model), () => this.fallbackKeywords(transcriptText, config));
      context = { ...context, analysis, keywords };
      titles = await this.safeAi(() => this.generateTitles(transcriptText, keywords, config, analysis, model), () => this.fallbackTitles(keywords, config, analysis));
    } else {
      analysis = this.fallbackAnalysis(transcriptText, config);
      keywords = this.fallbackKeywords(transcriptText, config);
      context = { ...context, analysis, keywords };
      titles = this.fallbackTitles(keywords, config, analysis);
    }

    context = { ...context, titles };
    if (this.hooks) context = await this.hooks.execute('video:afterTitleGenerate', context);
    titles = context.titles || titles;

    if (canUseAi) {
      hooks = await this.safeAi(() => this.generateHookSentence(titles[0], keywords, config.language, model), () => this.fallbackHooks(keywords, config));
      description = await this.safeAi(() => this.generateDescription(transcriptText, keywords, titles[0], hooks, config, model), () => this.fallbackDescription(transcriptText, keywords, titles[0], hooks, config));
    } else {
      hooks = this.fallbackHooks(keywords, config);
      description = this.fallbackDescription(transcriptText, keywords, titles[0], hooks, config);
    }

    context = { ...context, hookSentence: hooks, description };
    if (this.hooks) context = await this.hooks.execute('video:afterDescriptionGenerate', context);
    description = context.description || description;

    if (canUseAi) {
      tags = await this.safeAi(() => this.generateTags(transcriptText, keywords, config, model), () => this.fallbackTags(keywords, config));
      thumbnail = await this.safeAi(() => this.generateThumbnailContent(titles[0], keywords, analysis, model), () => this.fallbackThumbnail(titles[0], keywords, analysis));
    } else {
      tags = this.fallbackTags(keywords, config);
      thumbnail = this.fallbackThumbnail(titles[0], keywords, analysis);
    }

    context = { ...context, tags };
    if (this.hooks) context = await this.hooks.execute('video:afterTagGenerate', context);
    tags = context.tags || tags;

    const category = this.suggestCategory(keywords, analysis);
    const chapters = this.generateChapterSuggestions(transcriptText, analysis);
    const seoScore = this.calculateSEOScore({ titles, description, tags, keywords });
    const performance = this.estimatePerformance(titles[0], tags, keywords, analysis);
    const result = this.buildResult({
      ...context,
      sessionId,
      startedAt,
      analysis,
      keywords,
      titles,
      hookSentence: hooks,
      description,
      tags,
      thumbnail,
      category,
      chapters,
      seoScore,
      performance,
      modelUsed: canUseAi ? model : 'fallback-local',
      inputHash
    });

    this.addToCache(inputHash, result);
    this.saveToHistory(result, config.channelId);
    this.updateKeywordStats(keywords, config.language);
    if (this.hooks) await this.hooks.execute('content:optimized', result);
    return result;
  }

  async analyzeTranscript(transcript, language, model) {
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `Sen bir YouTube Shorts içerik analiz uzmanısın. Dil: ${language}. JSON döndür: {"mainTopic":"","subTopics":[],"sentiment":"positive|negative|neutral|mixed|funny|emotional","contentType":"tutorial|story|opinion|news|entertainment|review","targetAudience":"","keyMoments":[],"emotionalHooks":[],"callToActionSuggestions":[],"difficulty":"beginner|intermediate|advanced","uniqueValue":"","trendRelevance":"","estimatedRetention":70}` },
        { role: 'user', content: transcript.slice(0, 3500) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });
    return JSON.parse(response.choices[0].message.content);
  }

  async extractKeywords(transcript, language, analysis, model) {
    const highPerformers = Object.entries(this.store.get('keywordPerformance', {}))
      .sort((a, b) => (b[1].avgViews || 0) - (a[1].avgViews || 0))
      .slice(0, 12)
      .map(([keyword]) => keyword);
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `YouTube SEO uzmanısın. Dil: ${language}. Ana konu: ${analysis.mainTopic}. İyi performanslı kelimeler: ${highPerformers.join(', ')}. JSON döndür: {"primary":[],"secondary":[],"longtail":[],"trending":[],"questions":[],"semantic":[],"branded":[],"all":[]}` },
        { role: 'user', content: transcript.slice(0, 3000) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.25
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    parsed.all = unique([...(parsed.primary || []), ...(parsed.longtail || []), ...(parsed.secondary || []), ...(parsed.trending || []), ...(parsed.semantic || []), ...(parsed.all || [])]).slice(0, 25);
    parsed.withPerformance = parsed.all.map(keyword => ({ keyword, ...(this.store.get(`keywordPerformance.${keyword.toLowerCase()}`, {}) || {}) }));
    return parsed;
  }

  async generateTitles(transcript, keywords, config, analysis, model) {
    const previousTitles = this.store.get('contentHistory', []).slice(-30).map(item => item.title).filter(Boolean);
    const langTemplates = this.templates.title[config.language] || this.templates.title.tr;
    const styleTemplates = langTemplates[config.style] || langTemplates.clickbait || langTemplates.informative;
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `Sen YouTube Shorts başlık uzmanısın. 8 başlık üret. Kurallar: 60-80 karakter ideal, maksimum 100 karakter, dil ${config.language}, stil ${config.style}, merak boşluğu, güçlü kelime, 1-2 emoji, rakam kullan. Önceki başlıkları tekrar etme: ${previousTitles.slice(0, 12).join(' | ')}. Şablon ilhamı: ${styleTemplates.join(' | ')}. JSON: {"titles":[{"text":"","type":"","charCount":0,"emojiCount":0,"powerWords":[],"estimatedCTR":"high|medium|low","reasoning":""}],"recommended":0}` },
        { role: 'user', content: `Ana keyword: ${(keywords.primary || []).join(', ')}\nTüm keywordler: ${(keywords.all || []).join(', ')}\nİçerik türü: ${analysis.contentType}\nHedef: ${analysis.targetAudience}\nTranskript: ${transcript.slice(0, 1600)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    const titles = (parsed.titles || []).map((item, i) => typeof item === 'string' ? this.titleObject(item, 'ai', '') : { ...item, charCount: item.charCount || String(item.text || '').length, score: this.scoreTitleQuick(item.text || '') });
    const recommended = Number(parsed.recommended || 0);
    if (recommended > 0 && recommended < titles.length) titles.unshift(titles.splice(recommended, 1)[0]);
    return titles.sort((a, b) => (b.score || this.scoreTitleQuick(b.text)) - (a.score || this.scoreTitleQuick(a.text))).slice(0, 8);
  }

  async generateHookSentence(title, keywords, language, model) {
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `Açıklama için 3 kısa hook üret. Maksimum 2 cümle, dil: ${language}. JSON: {"hooks":[]}` },
        { role: 'user', content: `Başlık: ${this.titleText(title)}\nKeywordler: ${(keywords.primary || keywords.all || []).slice(0, 5).join(', ')}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.hooks || [];
  }

  async generateDescription(transcript, keywords, title, hooks, config, model) {
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `YouTube Shorts SEO açıklaması yaz. Dil: ${config.language}. İlk 2 satır güçlü hook olsun. 300-500 karakter, doğal keyword, CTA ve 5-8 hashtag. JSON: {"descriptions":[{"style":"standard","text":"","charCount":0,"hashtagCount":0,"hasCallToAction":true,"firstLine":""}],"hashtags":[],"callToActions":[]}` },
        { role: 'user', content: `Başlık: ${this.titleText(title)}\nHooklar: ${(hooks || []).join(' / ')}\nKeywordler: ${(keywords.all || []).join(', ')}\nCTA: ${config.ctaStyle}\nKanal: ${config.channelContext}\nTranskript: ${transcript.slice(0, 1400)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.55
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    const primary = parsed.descriptions?.[0]?.text || '';
    if (primary && !primary.toLowerCase().includes('#shorts')) {
      parsed.descriptions[0].text = `${primary}\n#shorts`;
    }
    return parsed;
  }

  async generateTags(transcript, keywords, config, model) {
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: `YouTube tag listesi üret. 18-30 tag, toplam 500 karakter altı, geniş+spesifik+long-tail karışımı, dil ${config.language}, kategori ${config.category}. JSON: {"tags":[],"breakdown":{"specific":[],"medium":[],"broad":[],"trending":[]}}` },
        { role: 'user', content: `Keywordler: ${(keywords.all || []).join(', ')}\nTranskript: ${transcript.slice(0, 1200)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.35
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    const list = this.optimizeTags(parsed.tags || keywords.all || [], 500);
    return { list, totalChars: list.join(',').length, breakdown: parsed.breakdown || {} };
  }

  async generateThumbnailContent(title, keywords, analysis, model) {
    const response = await this.callOpenAI({
      model,
      messages: [
        { role: 'system', content: 'YouTube Shorts thumbnail metni üret. Max 3-4 kelime, büyük ve dikkat çekici. JSON: {"textOptions":[{"text":"","style":"bold|dramatic|minimal","colorScheme":{"bg":"#000000","text":"#ffffff","accent":"#ff0000"}}],"layoutSuggestion":"text-top|text-bottom|text-center|split","facePosition":"left|right|center|none","backgroundStyle":"solid|gradient|blurred|dark","arrowOrPointer":true,"urgencyElement":""}' },
        { role: 'user', content: `Başlık: ${this.titleText(title)}\nSentiment: ${analysis.sentiment}\nKeywordler: ${(keywords.primary || []).join(', ')}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85
    });
    return JSON.parse(response.choices[0].message.content);
  }

  async callOpenAI(params) {
    await this.rateLimiter.wait();
    const response = await this.openai.chat.completions.create(params);
    if (response.usage) this.logTokenUsage(params.model, response.usage);
    return response;
  }

  async safeAi(fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      return fallback(error);
    }
  }

  fallbackAnalysis(transcript, config) {
    const words = normalizeWords([transcript, config.videoName, config.nicheKeywords].join(' '));
    const mainTopic = words.slice(0, 4).join(' ') || 'YouTube Shorts içeriği';
    const sentiment = /komik|gül|😂|🤣|funny/i.test(transcript) ? 'funny' : /hata|risk|yanlış|stop|yapma/i.test(transcript) ? 'negative' : 'positive';
    return {
      mainTopic,
      subTopics: words.slice(4, 12),
      sentiment,
      contentType: /nasıl|how|rehber|tutorial|öğren/i.test(transcript) ? 'tutorial' : 'entertainment',
      targetAudience: config.channelContext || 'Shorts izleyicileri, hızlı bilgi ve eğlence arayan kitle',
      keyMoments: splitSentences(transcript).slice(0, 5),
      emotionalHooks: ['merak', 'fayda', 'hızlı sonuç'],
      callToActionSuggestions: [config.ctaStyle, 'Yoruma fikrini yaz'],
      difficulty: 'beginner',
      uniqueValue: splitSentences(transcript)[0] || mainTopic,
      trendRelevance: 'Shorts formatına uygun kısa ve güçlü mesaj',
      estimatedRetention: transcript.length > 80 ? 72 : 62,
      language: config.language
    };
  }

  fallbackKeywords(transcript, config) {
    const fromText = normalizeWords([transcript, config.videoName, config.nicheKeywords].join(' ')).slice(0, 18);
    const defaults = config.language === 'tr'
      ? ['shorts', 'viral', 'keşfet', 'motivasyon', 'trend', 'başarı']
      : ['shorts', 'viral', 'trend', 'motivation', 'tips', 'learn'];
    const all = unique([...fromText, ...defaults]).slice(0, 25);
    return {
      primary: all.slice(0, 3),
      secondary: all.slice(3, 10),
      longtail: all.slice(0, 4).map(x => `${x} shorts`),
      trending: defaults.slice(0, 4),
      questions: config.language === 'tr' ? [`${all[0] || 'shorts'} nasıl yapılır?`] : [`how to ${all[0] || 'shorts'}?`],
      semantic: all.slice(5, 12),
      branded: [],
      all
    };
  }

  fallbackTitles(keywords, config, analysis) {
    const primary = keywords.primary?.[0] || keywords.all?.[0] || 'Shorts';
    const year = new Date().getFullYear();
    const langTemplates = this.templates.title[config.language] || this.templates.title.tr;
    const styleTemplates = langTemplates[config.style] || langTemplates.clickbait || langTemplates.informative;
    const titles = styleTemplates.map((template, i) => template
      .replaceAll('{keyword}', titleCase(primary))
      .replaceAll('{year}', String(year))
      .replaceAll('{number}', String(i + 3)));
    const extras = config.language === 'tr'
      ? [`${titleCase(primary)} İçin 3 Hızlı Sır 🔥`, `Bu ${titleCase(primary)} Hatasını Yapma!`, `${titleCase(primary)} Gerçeği Seni Şaşırtacak`]
      : [`3 Fast ${titleCase(primary)} Secrets 🔥`, `Stop Making This ${titleCase(primary)} Mistake`, `The ${titleCase(primary)} Truth Nobody Says`];
    return unique([...titles, ...extras]).slice(0, 8).map((text, index) => this.titleObject(text, index === 0 ? 'recommended' : 'fallback', analysis.contentType));
  }

  fallbackHooks(keywords, config) {
    const primary = keywords.primary?.[0] || keywords.all?.[0] || 'shorts';
    const templates = this.templates.hooks[config.language] || this.templates.hooks.tr;
    return templates.slice(0, 3).map(t => t.replaceAll('{keyword}', primary));
  }

  fallbackDescription(transcript, keywords, title, hooks, config) {
    const hook = hooks?.[0] || this.titleText(title);
    const mainKeyword = keywords.primary?.[0] || keywords.all?.[0] || 'shorts';
    const hashtags = unique(['#shorts', '#viral', '#keşfet', ...keywords.all.slice(0, 5).map(k => '#' + k.replace(/\s+/g, ''))]).slice(0, 8);
    const summary = splitSentences(transcript).slice(0, 2).join(' ') || `${mainKeyword} hakkında kısa ve etkili bir Shorts.`;
    const text = `${hook}\n\n${summary}\n\n${config.ctaStyle}\n\n${hashtags.join(' ')}`.slice(0, 700);
    return {
      descriptions: [{ style: config.descriptionStyle, text, charCount: text.length, hashtagCount: hashtags.length, hasCallToAction: true, firstLine: hook }],
      hashtags,
      callToActions: [config.ctaStyle]
    };
  }

  fallbackTags(keywords) {
    const list = this.optimizeTags(unique([...(keywords.all || []), 'Shorts', 'YouTubeShorts', 'viral', 'trend', 'fyp']), 500).slice(0, 30);
    return { list, totalChars: list.join(',').length, breakdown: { specific: list.slice(0, 5), medium: list.slice(5, 15), broad: list.slice(15) } };
  }

  fallbackThumbnail(title, keywords, analysis) {
    const primary = keywords.primary?.[0] || keywords.all?.[0] || 'BUNU İZLE';
    const colors = analysis.sentiment === 'negative'
      ? { bg: '#d63031', text: '#ffffff', accent: '#fdcb6e' }
      : { bg: '#111111', text: '#ffffff', accent: '#ff0000' };
    return {
      textOptions: [
        { text: titleCase(primary).toUpperCase().slice(0, 22), style: 'bold', colorScheme: colors },
        { text: 'BUNU BİL!', style: 'dramatic', colorScheme: colors },
        { text: '3 SANİYEDE', style: 'minimal', colorScheme: colors }
      ],
      layoutSuggestion: 'text-center',
      facePosition: 'right',
      backgroundStyle: 'gradient',
      arrowOrPointer: true,
      urgencyElement: 'ŞİMDİ'
    };
  }

  titleObject(text, type = 'fallback', contentType = '') {
    return {
      text,
      type,
      charCount: text.length,
      emojiCount: (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length,
      powerWords: detectPowerWords(text),
      estimatedCTR: this.scoreTitleQuick(text) >= 75 ? 'high' : this.scoreTitleQuick(text) >= 60 ? 'medium' : 'low',
      score: this.scoreTitleQuick(text),
      reasoning: contentType ? `${contentType} içeriğe göre üretildi.` : 'Yerel fallback şablonundan üretildi.'
    };
  }

  titleText(title) {
    return typeof title === 'string' ? title : title?.text || '';
  }

  scoreTitleQuick(title) {
    let score = 50;
    if (title.length >= 40 && title.length <= 70) score += 15;
    else if (title.length >= 30 && title.length <= 85) score += 8;
    else if (title.length > 90) score -= 15;
    else if (title.length < 20) score -= 10;
    const emojiCount = (title.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
    if (emojiCount >= 1 && emojiCount <= 3) score += 10;
    else if (emojiCount === 0) score -= 4;
    if (/\d/.test(title)) score += 8;
    if (/[!?]/.test(title)) score += 5;
    score += detectPowerWords(title).length * 3;
    return Math.min(100, Math.max(0, score));
  }

  estimatePerformance(title, tags, keywords, analysis) {
    const titleText = this.titleText(title);
    const tagList = tags?.list || tags || [];
    let score = 45;
    const factors = [];
    const add = (condition, impact, factor) => { if (condition) { score += impact; factors.push({ factor, impact }); } };
    add(titleText.length >= 40 && titleText.length <= 70, 12, 'Başlık uzunluğu ideal');
    add(/[🔥😱❌✅💪🚀💡⚡]/u.test(titleText), 6, 'Dikkat çekici emoji');
    add(/\d/.test(titleText), 5, 'Rakam içeriyor');
    add(/[!?]/.test(titleText), 4, 'Güçlü noktalama');
    add(tagList.length >= 18 && tagList.length <= 30, 10, 'Optimal tag sayısı');
    add(tagList.join(',').length >= 300 && tagList.join(',').length <= 500, 5, 'Tag alanı iyi kullanıldı');
    add((analysis?.estimatedRetention || 0) >= 70, 8, 'Yüksek tahmini retention');
    add(['positive', 'funny'].includes(analysis?.sentiment), 5, 'Pozitif/eğlenceli sentiment');
    const kwMatch = (keywords.all || []).filter(k => titleText.toLowerCase('tr-TR').includes(k.toLowerCase('tr-TR'))).length;
    add(kwMatch >= 1, Math.min(kwMatch * 4, 10), `${kwMatch} keyword başlıkta`);
    const finalScore = Math.min(100, Math.max(0, score));
    return {
      score: finalScore,
      label: finalScore >= 85 ? '🏆 Mükemmel' : finalScore >= 70 ? '✅ İyi' : finalScore >= 55 ? '⚡ Orta' : finalScore >= 40 ? '⚠️ Zayıf' : '❌ Kötü',
      factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
      suggestions: this.buildSuggestions(titleText, tagList, analysis),
      breakdown: { titleScore: Math.round(finalScore * 0.5), tagScore: Math.round(finalScore * 0.25), contentScore: Math.round(finalScore * 0.25) }
    };
  }

  buildSuggestions(title, tags, analysis) {
    const suggestions = [];
    if (title.length > 70) suggestions.push({ priority: 'high', icon: '✂️', text: 'Başlığı 60-70 karakter bandına indir', impact: 'CTR +15%' });
    if (!/[🔥😱❌✅💡⚡]/u.test(title)) suggestions.push({ priority: 'medium', icon: '😊', text: 'İlk 3 karaktere stratejik emoji ekle', impact: 'CTR +8%' });
    if (!/\d/.test(title)) suggestions.push({ priority: 'medium', icon: '🔢', text: 'Başlığa sayı ekle', impact: 'CTR +12%' });
    if (tags.length < 15) suggestions.push({ priority: 'high', icon: '🏷️', text: `Daha fazla tag ekle (${tags.length}/20+)`, impact: 'Keşfedilme +20%' });
    if (analysis?.contentType === 'tutorial') suggestions.push({ priority: 'low', icon: '📝', text: 'Açıklamaya chapter/timestamp ekle', impact: 'Watch time +10%' });
    return suggestions;
  }

  suggestCategory(keywords, analysis) {
    const categoryMap = [
      { id: '28', name: 'Bilim & Teknoloji', keys: ['tech', 'technology', 'software', 'coding', 'yazılım', 'teknoloji', 'yapay zeka', 'ai'] },
      { id: '26', name: 'Nasıl Yapılır & Stil', keys: ['how', 'tutorial', 'diy', 'tips', 'nasıl', 'yapılır', 'ipucu', 'hack', 'rehber'] },
      { id: '27', name: 'Eğitim', keys: ['education', 'learn', 'science', 'eğitim', 'öğren', 'bilim', 'ders'] },
      { id: '24', name: 'Eğlence', keys: ['entertainment', 'fun', 'funny', 'comedy', 'eğlence', 'komedi', 'mizah'] },
      { id: '20', name: 'Oyun', keys: ['gaming', 'game', 'gameplay', 'oyun', 'minecraft', 'fortnite'] },
      { id: '17', name: 'Spor', keys: ['sport', 'fitness', 'workout', 'spor', 'antrenman', 'gym', 'sağlık'] },
      { id: '10', name: 'Müzik', keys: ['music', 'song', 'beat', 'müzik', 'şarkı'] },
      { id: '25', name: 'Haberler & Politika', keys: ['news', 'politics', 'haber', 'politika', 'gündem', 'ekonomi'] },
      { id: '22', name: 'İnsanlar & Bloglar', keys: ['people', 'blog', 'vlog', 'daily', 'life', 'günlük', 'yaşam', 'deneyim'] }
    ];
    const all = [...(keywords.all || []), ...(keywords.primary || []), analysis?.mainTopic || '', analysis?.contentType || ''].map(k => String(k).toLowerCase('tr-TR'));
    let best = categoryMap[8];
    let bestScore = 0;
    for (const cat of categoryMap) {
      const score = cat.keys.filter(key => all.some(kw => kw.includes(key))).length;
      if (score > bestScore) { best = cat; bestScore = score; }
    }
    return best;
  }

  generateChapterSuggestions(transcript, analysis) {
    const moments = analysis?.keyMoments?.length ? analysis.keyMoments : splitSentences(transcript).slice(0, 5);
    return moments.slice(0, 5).map((moment, i) => ({ time: `0:${String((i + 1) * 10).padStart(2, '0')}`, title: trimText(moment, 70), description: `Bu bölümde: ${trimText(moment, 90)}` }));
  }

  calculateSEOScore(context) {
    const title = this.titleText(context.titles?.[0] || context.title);
    const tags = context.tags?.list || context.tags || [];
    const desc = context.description?.descriptions?.[0]?.text || context.description?.primary || context.description || '';
    const keywords = context.keywords?.primary || context.keywords?.all || [];
    let score = 0;
    const checks = [];
    const check = (condition, points, label, tip = '') => { if (condition) score += points; checks.push({ label, passed: Boolean(condition), points: condition ? points : 0, maxPoints: points, status: condition ? '✅' : '❌', tip: condition ? '' : tip }); };
    check(title.length >= 30 && title.length <= 70, 15, 'Başlık uzunluğu (30-70)', `${title.length} karakter. Kısalt/uzat.`);
    check(keywords.some(k => title.toLowerCase('tr-TR').includes(String(k).toLowerCase('tr-TR'))), 20, 'Ana keyword başlıkta', 'Ana keywordü başlığa ekle.');
    check(/\d/.test(title), 5, 'Başlıkta rakam var', '3/5/2026 gibi sayı ekle.');
    check(/[🔥😱❌✅💡⚡💪🚀]/u.test(title), 5, 'Başlıkta emoji var', 'Stratejik emoji ekle.');
    check(desc.length >= 120 && desc.length <= 700, 10, 'Açıklama uzunluğu ideal', 'Shorts için 150-500 karakter iyi çalışır.');
    check(desc.toLowerCase().includes('#shorts'), 10, '#shorts hashtag mevcut', '#shorts ekle.');
    check(keywords.some(k => desc.toLowerCase('tr-TR').includes(String(k).toLowerCase('tr-TR'))), 15, 'Ana keyword açıklamada', 'Açılışa ana keyword ekle.');
    check(tags.length >= 15 && tags.length <= 30, 10, 'Optimal tag sayısı', '18-30 tag hedefle.');
    check(tags.join(',').length <= 500, 5, 'Tag karakter limiti OK', 'YouTube tag limiti 500 karakter.');
    check(keywords.some(k => tags.some(t => String(t).toLowerCase('tr-TR').includes(String(k).toLowerCase('tr-TR')))), 5, 'Ana keyword tag listesinde', 'Ana keyword tag olarak ekle.');
    const maxScore = checks.reduce((sum, item) => sum + item.maxPoints, 0);
    return { score, maxScore, percentage: Math.round((score / maxScore) * 100), grade: score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D', checklist: checks, improvements: checks.filter(c => !c.passed && c.tip).map(c => c.tip) };
  }

  /** Her video açıklamasına varsayılan hashtag blokları (YouTuber panel ile aynı sözleşme). */
  appendDefaultDescriptionHashtags(text) {
    const tags = ['#viral', '#model', '#rasta'];
    const d = String(text || '').trimEnd();
    const missing = tags.filter((t) => !d.includes(t));
    if (!missing.length) return d;
    return d ? `${d}\n\n${missing.join(' ')}` : missing.join(' ');
  }

  buildResult(context) {
    const titles = context.titles || [];
    const bestTitle = titles[0];
    const rawDesc = context.description?.descriptions?.[0]?.text || '';
    const descText = this.appendDefaultDescriptionHashtags(rawDesc);
    const tagList = context.tags?.list || context.tags || [];
    return {
      sessionId: context.sessionId,
      generatedAt: new Date().toISOString(),
      processingTime: Date.now() - context.startedAt,
      modelUsed: context.modelUsed,
      inputHash: context.inputHash,
      analysis: context.analysis,
      keywords: context.keywords,
      titles: { all: titles, selected: bestTitle, selectedText: this.titleText(bestTitle), alternatives: titles.slice(1) },
      hooks: context.hookSentence || [],
      description: { primary: descText, alternatives: context.description?.descriptions?.slice(1) || [], hashtags: context.description?.hashtags || [], callToActions: context.description?.callToActions || [] },
      tags: { list: tagList, totalChars: tagList.join(',').length, breakdown: context.tags?.breakdown || {} },
      thumbnail: context.thumbnail,
      category: context.category,
      chapters: context.chapters,
      performance: context.performance,
      seoScore: context.seoScore,
      readyToCopy: { title: this.titleText(bestTitle), description: descText, tags: tagList.join(', ') }
    };
  }

  mergeOptions(options) {
    return {
      language: 'tr',
      category: 'general',
      style: 'clickbait',
      descriptionStyle: 'standard',
      ctaStyle: 'Yoruma tek kelime yaz 👇',
      channelContext: '',
      channelId: 'default',
      modelTier: 'fast',
      videoName: '',
      nicheKeywords: '',
      ...options
    };
  }

  optimizeTags(tags, limit) {
    const output = [];
    let total = 0;
    for (const raw of unique(tags)) {
      const tag = String(raw || '').replace(/^#/, '').trim();
      if (!tag) continue;
      if (total + tag.length + 1 <= limit) {
        output.push(tag);
        total += tag.length + 1;
      }
    }
    return output;
  }

  hashText(text) {
    return crypto.createHash('sha256').update(String(text || '')).digest('hex');
  }

  getFromCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > 3_600_000) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  addToCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
  }

  saveToHistory(result, channelId = 'default') {
    this.store.update(data => {
      const history = data.contentHistory || [];
      history.push({
        id: result.sessionId,
        channelId,
        title: result.readyToCopy.title,
        description: result.readyToCopy.description,
        tags: result.tags.list,
        keywords: result.keywords.all || [],
        category: result.category,
        seoScore: result.seoScore.percentage,
        performanceScore: result.performance.score,
        modelUsed: result.modelUsed,
        createdAt: result.generatedAt
      });
      data.contentHistory = history.slice(-1000);
      return data;
    });
  }

  updateKeywordStats(keywords, language = 'tr') {
    const all = keywords?.all || [];
    this.store.update(data => {
      data.keywordPerformance = data.keywordPerformance || {};
      for (const kw of all) {
        const key = String(kw).toLowerCase('tr-TR');
        const row = data.keywordPerformance[key] || { keyword: kw, totalUses: 0, avgViews: 0, avgCtr: 0, trendScore: 0, language };
        row.totalUses += 1;
        row.lastUsed = new Date().toISOString();
        row.trendScore = Math.min(100, (row.trendScore || 0) + 1);
        data.keywordPerformance[key] = row;
      }
      return data;
    });
  }

  updatePerformanceFeedback(videoId, metrics = {}) {
    this.store.update(data => {
      const item = (data.contentHistory || []).find(x => x.id === videoId || x.youtubeVideoId === videoId);
      if (item) {
        item.youtubeVideoId = metrics.youtubeVideoId || item.youtubeVideoId || videoId;
        item.actualViews = Number(metrics.views || 0);
        item.actualCtr = Number(metrics.ctr || 0);
        item.actualLikes = Number(metrics.likes || 0);
        item.updatedAt = new Date().toISOString();
        for (const kw of item.keywords || []) {
          const key = String(kw).toLowerCase('tr-TR');
          const row = data.keywordPerformance[key] || { keyword: kw, totalUses: 0, avgViews: 0, avgCtr: 0, trendScore: 0 };
          row.avgViews = ((row.avgViews || 0) * Math.max(row.totalUses || 1, 1) + item.actualViews) / (Math.max(row.totalUses || 1, 1) + 1);
          row.avgCtr = ((row.avgCtr || 0) * Math.max(row.totalUses || 1, 1) + item.actualCtr) / (Math.max(row.totalUses || 1, 1) + 1);
          data.keywordPerformance[key] = row;
        }
      }
      return data;
    });
  }

  logTokenUsage(model, usage) {
    const prices = { 'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.00060 / 1000 }, 'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 } };
    const p = prices[model] || prices['gpt-4o-mini'];
    const cost = ((usage.prompt_tokens || 0) * p.input) + ((usage.completion_tokens || 0) * p.output);
    this.store.push('tokenUsage', { model, tokens: usage.total_tokens || 0, promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0, costUsd: cost, at: new Date().toISOString() }, 2000);
  }

  getCostReport(days = 30) {
    const since = Date.now() - days * 86_400_000;
    const rows = this.store.get('tokenUsage', []).filter(row => new Date(row.at).getTime() >= since);
    const grouped = {};
    for (const row of rows) {
      grouped[row.model] ||= { model: row.model, requests: 0, totalTokens: 0, totalCostUsd: 0 };
      grouped[row.model].requests += 1;
      grouped[row.model].totalTokens += row.tokens || 0;
      grouped[row.model].totalCostUsd += row.costUsd || 0;
    }
    return Object.values(grouped).map(row => ({ ...row, avgCostPerRequest: row.requests ? row.totalCostUsd / row.requests : 0 }));
  }

  getHistory(limit = 50) {
    return this.store.get('contentHistory', []).slice(-limit).reverse();
  }
}

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }
  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return;
    }
    const waitMs = this.windowMs - (now - this.requests[0]) + 50;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return this.wait();
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function unique(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
}

function normalizeWords(text) {
  const stop = new Set('ve veya ama için ile gibi daha çok bir bu şu da de mi ne nasıl neden the and for you your are from that this'.split(' '));
  return unique(String(text || '')
    .toLowerCase('tr-TR')
    .replace(/[#@]/g, ' ')
    .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stop.has(w)))
    .slice(0, 30);
}

function splitSentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 8);
}

function titleCase(text) {
  return String(text || '').split(/\s+/).map(w => w ? w[0].toLocaleUpperCase('tr-TR') + w.slice(1) : w).join(' ');
}

function trimText(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : value.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function detectPowerWords(title) {
  const power = ['sır', 'şok', 'gizli', 'hızlı', 'kolay', 'ücretsiz', 'dikkat', 'önemli', 'viral', 'inanılmaz', 'gerçek', 'kanıtlanmış', 'secret', 'shocking', 'hidden', 'fast', 'easy', 'free', 'warning', 'viral', 'truth', 'proven', 'stop', 'never'];
  const lower = String(title || '').toLowerCase('tr-TR');
  return power.filter(w => lower.includes(w));
}

export default ContentPipeline;
