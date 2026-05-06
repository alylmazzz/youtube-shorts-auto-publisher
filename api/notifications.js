// ─────────────────────────────────────────────────
// Notifications — GET /api/notifications
// ─────────────────────────────────────────────────
export default function handler(req, res) {
  const limit = Number(req.query.limit || 50);
  res.json({
    ok: true,
    notifications: [],
    message: 'Notifications are stored locally.',
  });
}
