/**
 * Profesyonel konuşma-metni (STT) hattı: doğruluk, eksiksizlik ve Türkçe/İngilizce yazım için
 * OpenAI Transcriptions API parametrelerini tek yerde toplar.
 */

/** Kalite katmanı → model (yüksekten düşüğe doğruluk) */
export const TRANSCRIPTION_TIER_MODELS = {
  maximum: 'gpt-4o-transcribe',
  balanced: 'gpt-4o-mini-transcribe-2025-12-15',
  economy: 'gpt-4o-mini-transcribe',
};

const GPT4O_MODELS = new Set([
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini-transcribe-2025-12-15',
]);

const WHISPER_MODELS = new Set(['whisper-1']);

const DEFAULT_BASE_TR = `Bu bir YouTube Shorts / video ses transkripsiyonudur.
Görev: Konuşulan içeriği kelime kelime eksiksiz aktar; cümleleri anlamlı noktalama ile ayır.
Kurallar:
- Hiçbir anlamlı kelimeyi atlama veya özetleme.
- Dolgu seslerini (uh, şey, yani) konuşmacı net söylediyse yaz; gereksiz tekrarları abartmadan koru.
- Türkçe yazım: ğ ü ş ı ö ç harfleri doğru; özne-yüklem uyumu bozulmasın.
- Sayıları ve yüzdeleri konuşulduğu gibi yaz (isteğe bağlı rakam veya yazıyla tutarlı).
Profesyonel, yayına uygun düz metin üret.`;

const DEFAULT_BASE_EN = `This is speech from a YouTube Short / video.
Transcribe every meaningful word; use clear punctuation and natural sentences.
Do not summarize or omit content. Preserve numbers and technical terms when spoken clearly.`;

/**
 * @param {object} opts
 * @param {string} [opts.language] ISO-639-1 veya 'auto'
 * @param {string} [opts.glossary] virgülle terimler
 * @param {string} [opts.channelContext]
 * @param {string} [opts.customPrompt] kullanıcı / config üstü yazı
 * @param {string} [opts.base] 'tr' | 'en'
 */
export function buildTranscriptionPrompt(opts = {}) {
  const baseLang = opts.base || (opts.language && opts.language !== 'auto' ? opts.language : 'tr');
  let core = baseLang === 'en' ? DEFAULT_BASE_EN : DEFAULT_BASE_TR;
  if (opts.customPrompt && String(opts.customPrompt).trim()) {
    core = String(opts.customPrompt).trim().slice(0, 3500);
  }
  const extras = [];
  const g = [opts.glossary, opts.channelContext].filter((x) => x && String(x).trim()).join(' | ');
  if (g.trim()) {
    extras.push(`Bağlam ve beklenen terimler (isimler, jargon doğru yazılsın): ${g.trim().slice(0, 1500)}`);
  }
  const combined = extras.length ? `${core}\n\n${extras.join('\n')}` : core;
  return combined.slice(0, 4000);
}

/**
 * @param {string} tier maximum | balanced | economy
 * @param {string} [explicitModel] config veya body’den doğrudan model adı
 */
export function resolveTranscriptionModel(tier, explicitModel) {
  if (explicitModel && String(explicitModel).trim()) {
    return String(explicitModel).trim();
  }
  const t = (tier && TRANSCRIPTION_TIER_MODELS[tier]) ? tier : 'maximum';
  return TRANSCRIPTION_TIER_MODELS[t];
}

/**
 * @param {import('openai').default} openai
 * @param {object} params
 * @param {import('openai').Uploadable} params.file
 * @param {string} params.model
 * @param {string} [params.language] ISO veya undefined (auto)
 * @param {string} params.prompt
 * @param {boolean} [params.longAudioChunking] uzun seslerde parçalama
 */
export async function runTranscription(openai, params) {
  const { file, model, language, prompt, longAudioChunking = true } = params;
  const temperature = typeof params.temperature === 'number' ? params.temperature : 0;

  if (WHISPER_MODELS.has(model)) {
    const result = await openai.audio.transcriptions.create({
      file,
      model,
      language: language || undefined,
      prompt: prompt ? prompt.slice(0, 2000) : undefined,
      response_format: 'verbose_json',
      temperature,
      timestamp_granularities: ['segment'],
    });
    const text = result.text || '';
    const segments = result.segments || [];
    return {
      ok: true,
      text,
      transcript: text,
      model,
      segments,
      duration: result.duration,
      language: result.language,
      raw: result,
      pipeline: 'whisper-verbose',
    };
  }

  if (GPT4O_MODELS.has(model)) {
    const payload = {
      file,
      model,
      language: language || undefined,
      prompt: prompt || undefined,
      response_format: 'json',
      temperature,
    };
    if (longAudioChunking) {
      payload.chunking_strategy = 'auto';
    }
    try {
      const result = await openai.audio.transcriptions.create(payload);
      const text = result.text || '';
      return {
        ok: true,
        text,
        transcript: text,
        model,
        raw: result,
        pipeline: longAudioChunking ? 'gpt4o-chunked' : 'gpt4o',
      };
    } catch (err) {
      if (longAudioChunking && payload.chunking_strategy) {
        const fallback = { ...payload };
        delete fallback.chunking_strategy;
        const result = await openai.audio.transcriptions.create(fallback);
        const text = result.text || '';
        return {
          ok: true,
          text,
          transcript: text,
          model,
          raw: result,
          pipeline: 'gpt4o-retry-no-chunk',
          warning: String(err.message || err),
        };
      }
      throw err;
    }
  }

  const result = await openai.audio.transcriptions.create({
    file,
    model,
    language: language || undefined,
    prompt: prompt || undefined,
    response_format: 'json',
    temperature,
  });
  const text = result.text || '';
  return {
    ok: true,
    text,
    transcript: text,
    model,
    raw: result,
    pipeline: 'generic',
  };
}
