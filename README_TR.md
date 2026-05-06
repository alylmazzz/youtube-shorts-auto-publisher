# YouTube Shorts Auto Publisher 🎬

**AI destekli YouTube Shorts otomasyon platformu** — içerik hattı, kuyruk yönetimi, analitik, oyunlaştırma, eklenti sistemi, OAuth token yönetimi ve video işleme.

## ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| **🤖 AI İçerik Hattı** | OpenAI ile otomatik başlık, açıklama, etiket, küçük resim üretimi |
| **📋 Kuyruk Yöneticisi** | Öncelikli yükleme kuyruğu, yeniden deneme, zamanlama ve akıllı saat öğrenme |
| **🔌 Hook/Eklenti Sistemi** | 30+ hook noktası ile olay odaklı mimari, hazır eklentiler |
| **📊 Analitik Motoru** | Olay takibi, günlük raporlar, başarı oranı, görüntülenme/beğeni metrikleri |
| **🎮 Oyunlaştırma** | XP, seviye, seri, görev ve rozet sistemi |
| **🔐 OAuth Token Yönetimi** | Google/YouTube API token'larının otomatik yenilenmesi |
| **🎥 Video İşlemci** | FFmpeg entegrasyonu: analiz, Shorts çıktısı, altyazı, küçük resim |
| **📝 Transkripsiyon Hattı** | Çok seviyeli OpenAI transkripsiyon (GPT-4o, Whisper), Türkçe/İngilizce destek |

## 🚀 Hızlı Başlangıç (Lokal)

```bash
# Bağımlılıkları yükle
npm install

# .env dosyası oluştur
cp .env.example .env
# .env dosyasını düzenle: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, OPENAI_API_KEY

# Sunucuyu başlat
npm start
# → http://localhost:8788
```

## 🌐 Vercel Deploy

API, Vercel üzerinde serverless olarak çalışır (konfigürasyon ve içerik hattı — dosya yükleme, transkripsiyon ve video işleme lokal sunucu gerektirir).

## 📁 Proje Yapısı

```
├── api/                    # Vercel serverless fonksiyonlar
├── public/                 # Statik dosyalar
├── src/                    # Kaynak modüller
│   ├── hooks/
│   ├── services/
│   ├── queue/
│   ├── plugins/
│   └── utils/
├── local_oauth_refresh_server.js  # Tam lokal sunucu
├── vercel.json
├── package.json
└── README.md
```

---

[![GitHub](https://img.shields.io/github/license/alyilmazzz/youtube-shorts-auto-publisher)](LICENSE)
