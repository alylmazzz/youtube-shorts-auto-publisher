// ─────────────────────────────────────────────────
// Queue management — GET /api/queue, POST /api/queue
// ─────────────────────────────────────────────────
const handlers = {
  list(req, res) {
    res.json({
      ok: true,
      stats: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        isProcessing: false,
        currentJob: null,
      },
      items: [],
      message: 'Queue is managed locally. Use the local server for queue operations with file uploads.',
    });
  },

  async add(req, res) {
    res.json({
      ok: true,
      job: null,
      stats: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      message: 'Queue management requires the local server for file-based operations.',
    });
  },
};

export default handlers;
