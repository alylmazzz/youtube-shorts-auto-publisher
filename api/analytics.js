// ─────────────────────────────────────────────────
// Analytics — GET /api/analytics/summary
//             POST /api/analytics/event
// ─────────────────────────────────────────────────
const handlers = {
  summary(req, res) {
    const days = Number(req.query.days || 30);
    res.json({
      ok: true,
      summary: {
        days,
        totalEvents: 0,
        uploads: 0,
        failures: 0,
        seoGenerated: 0,
        successRate: 0,
        views: 0,
        likes: 0,
        daily: [],
        lastEvents: [],
      },
      message: 'Analytics data is stored locally. Run the local server for persistent analytics.',
    });
  },

  async track(req, res) {
    res.json({
      ok: true,
      event: {
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        eventType: req.body.eventType || 'custom',
        createdAt: new Date().toISOString(),
      },
    });
  },
};

export default handlers;
