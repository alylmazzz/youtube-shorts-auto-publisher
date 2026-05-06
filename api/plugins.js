// ─────────────────────────────────────────────────
// Plugins — GET /api/plugins
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  res.json({
    ok: true,
    plugins: [
      {
        name: 'auto-hashtag',
        version: '1.1.0',
        description: 'Trend, kategori ve Shorts uyumlu hashtagleri otomatik birleştirir.',
        enabled: true,
        loadedAt: new Date().toISOString(),
      },
      {
        name: 'sentiment-analysis',
        version: '1.1.0',
        description: 'Transkript duygu sinyalini çıkarır ve başlık/thumbnail için emoji tonu önerir.',
        enabled: true,
        loadedAt: new Date().toISOString(),
      },
      {
        name: 'watermark',
        version: '1.0.0',
        description: 'assets/watermark.png varsa video işleme aşamasında watermark için çıktı yolu hazırlar.',
        enabled: true,
        loadedAt: new Date().toISOString(),
      },
    ],
    hookPoints: [
      'video:beforeImport', 'video:afterImport',
      'video:beforeTranscribe', 'video:afterTranscribe',
      'video:beforeTitleGenerate', 'video:afterTitleGenerate',
      'video:beforeUpload', 'video:afterUpload',
      'token:beforeRefresh', 'token:afterRefresh',
      'queue:itemAdded', 'queue:processingStart',
      'system:startup', 'system:error',
    ],
  });
}
