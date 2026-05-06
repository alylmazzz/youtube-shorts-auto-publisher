// ─────────────────────────────────────────────────
// Gamification — GET /api/gamification/stats
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  res.json({
    ok: true,
    stats: {
      profile: {
        level: 1,
        xp: 0,
        streak: 0,
        lastPublishDate: null,
        badges: [],
        nextLevelXp: 500,
        levelProgressPct: 0,
      },
      missions: [
        { id: 'first_upload', title: 'İlk Shorts Yayını', target: 1, metric: 'uploads', rewardXp: 100, completed: false, progress: 0 },
        { id: 'three_day_streak', title: '3 Günlük Seri', target: 3, metric: 'streak', rewardXp: 250, completed: false, progress: 0 },
        { id: 'seo_master', title: 'SEO Ustası', target: 10, metric: 'seoGenerated', rewardXp: 150, completed: false, progress: 0 },
        { id: 'queue_builder', title: 'Kuyruk Mimarı', target: 20, metric: 'queued', rewardXp: 200, completed: false, progress: 0 },
      ],
      recentAchievements: [],
    },
    message: 'Gamification data is stored locally. Run the local server for persistent stats.',
  });
}
