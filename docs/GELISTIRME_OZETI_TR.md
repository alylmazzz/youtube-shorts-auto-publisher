# Youtubert v2.0 Geliştirme Özeti

Bu paket, verilen yol haritasındaki ana parçalar mevcut lokal yapıyı bozmadan entegre edilerek geliştirildi.

## Eklenen ana katmanlar

- `hooks/hookEngine.js`: Event-driven hook motoru, plugin kayıt/sıralama, plugin aç/kapat, hook logları.
- `plugins/*.plugin.js`: Auto hashtag, sentiment analysis ve watermark plugin örnekleri.
- `services/contentPipeline.js`: Gelişmiş YouTube Shorts içerik üretimi. OpenAI API key varsa AI üretim, yoksa güvenli lokal fallback.
- `services/videoProcessor.js`: FFprobe/FFmpeg destekli video analiz, Shorts kalite kontrolü, thumbnail/subtitle/vertical export yardımcıları.
- `queue/queueManager.js`: JSON tabanlı upload kuyruğu, retry, priority, akıllı saat öğrenme altyapısı.
- `services/analyticsEngine.js`: Event tracking, günlük/30 günlük özet, başarı oranı.
- `services/gamification.js`: XP, level, streak, görev ve badge sistemi.
- `services/notificationManager.js`: Lokal bildirim kayıt altyapısı.
- `services/pipelineManager.js`: Video analizi + content pipeline + opsiyonel kuyruk kaydını birleştiren manager.
- `utils/jsonStore.js`: SQLite kurulumu gerektirmeyen, atomik JSON store altyapısı.

## Eklenen API endpointleri

- `GET /health`
- `POST /api/content/generate`
- `GET /api/content/history`
- `GET /api/content/cost-report`
- `POST /api/content/feedback`
- `POST /api/pipeline/prepare`
- `GET /api/pipeline/sessions`
- `POST /api/video/analyze`
- `POST /api/video/process-shorts`
- `GET /api/video/reports`
- `GET /api/plugins`
- `POST /api/plugins/:name/toggle`
- `GET /api/hooks/logs`
- `GET /api/queue`
- `POST /api/queue`
- `POST /api/queue/batch`
- `POST /api/queue/:id/retry`
- `POST /api/queue/:id/priority`
- `DELETE /api/queue/:id`
- `GET /api/analytics/summary`
- `POST /api/analytics/event`
- `GET /api/gamification/stats`
- `POST /api/gamification/xp`
- `GET /api/notifications`
- `POST /api/notifications`

## Frontend yenilikleri

HTML paneline şunlar eklendi:

- Gelişmiş AI ContentPipeline aç/kapat.
- İçerik dili, başlık stili, model modu ve kanal bağlamı ayarları.
- Gelişmiş Otomasyon Merkezi paneli.
- Plugin listesi ve plugin aç/kapat.
- Server tarafı kuyruk görüntüleme.
- Sıradaki videoyu AI SEO ile server kuyruğuna yazma.
- Gamification görev/level görünümü.
- Analytics özet kartları.

## Çalışma notları

- Sistem mevcut browser tabanlı Drive indirme + YouTube Resumable Upload akışını korur.
- OpenAI API key yoksa ContentPipeline durmaz; lokal fallback ile başlık/açıklama/tag üretir.
- FFmpeg/FFprobe yoksa VideoProcessor analiz endpointleri hata mesajıyla uyarır, ana upload akışı etkilenmez.
- Kalıcı OAuth token yönetimi eski haliyle korunmuştur.
- `.youtube_oauth_local.json` güvenli dosyadır; başkalarıyla paylaşılmamalıdır.
