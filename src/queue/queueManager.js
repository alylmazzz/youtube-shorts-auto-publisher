import path from 'path';
import { EventEmitter } from 'events';
import { JsonStore } from '../utils/jsonStore.js';

export class QueueManager extends EventEmitter {
  constructor({ dataDir, hooks } = {}) {
    super();
    this.hooks = hooks || null;
    this.processing = false;
    this.currentJob = null;
    this.store = new JsonStore(path.join(dataDir || path.join(process.cwd(), 'data'), 'queue.json'), {
      uploadQueue: [],
      uploadHistory: [],
      scheduleTemplates: [
        { id: 'aggressive', name: 'Agresif', description: 'Günde 6 video', preferredTimes: ['08:00','11:00','14:00','17:00','20:00','23:00'], timezone: 'Europe/Istanbul', isActive: true },
        { id: 'moderate', name: 'Dengeli', description: 'Günde 3 video', preferredTimes: ['09:00','15:00','21:00'], timezone: 'Europe/Istanbul', isActive: true },
        { id: 'conservative', name: 'Muhafazakar', description: 'Günde 1 video', preferredTimes: ['21:00'], timezone: 'Europe/Istanbul', isActive: true }
      ],
      smartSchedule: []
    });
  }

  setHookEngine(hooks) { this.hooks = hooks; }

  async addToQueue(item = {}) {
    if (!item.videoPath && !item.driveFileId && !item.videoName) throw new Error('videoPath, driveFileId veya videoName gerekli');
    const job = {
      id: makeId('queue'),
      videoPath: item.videoPath || '',
      driveFileId: item.driveFileId || '',
      videoName: item.videoName || item.title || '',
      title: item.title || '',
      description: item.description || '',
      tags: Array.isArray(item.tags) ? item.tags : splitTags(item.tags),
      category: item.category || '22',
      privacy: item.privacy || 'public',
      scheduledTime: item.scheduledTime || null,
      status: 'pending',
      priority: Number(item.priority || 5),
      retryCount: 0,
      maxRetries: Number(item.maxRetries || 3),
      errorMessage: '',
      youtubeVideoId: '',
      metadata: item.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };
    this.store.push('uploadQueue', job, 5000);
    this.emit('itemAdded', job);
    if (this.hooks) await this.hooks.execute('queue:itemAdded', job);
    return job;
  }

  async addBatch(items = []) {
    const jobs = [];
    for (const item of items) jobs.push(await this.addToQueue(item));
    return jobs;
  }

  getQueue(status = null, limit = 50, offset = 0) {
    let rows = this.store.get('uploadQueue', []);
    if (status && status !== 'all') rows = rows.filter(item => item.status === status);
    const order = { processing: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
    return rows
      .slice()
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.priority - b.priority || new Date(a.createdAt) - new Date(b.createdAt))
      .slice(offset, offset + limit);
  }

  getStats() {
    const rows = this.store.get('uploadQueue', []);
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const history = this.store.get('uploadHistory', []);
    return {
      total: rows.length,
      pending: rows.filter(x => x.status === 'pending').length,
      processing: rows.filter(x => x.status === 'processing').length,
      completed: rows.filter(x => x.status === 'completed').length,
      failed: rows.filter(x => x.status === 'failed').length,
      uploadedToday: history.filter(x => String(x.uploadedAt || '').startsWith(todayKey)).length,
      uploadedThisWeek: history.filter(x => new Date(x.uploadedAt).getTime() >= weekAgo).length,
      isProcessing: this.processing,
      currentJob: this.currentJob
    };
  }

  updateStatus(id, status, extra = {}) {
    let updated = null;
    this.store.update(data => {
      data.uploadQueue = (data.uploadQueue || []).map(item => {
        if (item.id !== id) return item;
        updated = {
          ...item,
          status,
          ...extra,
          retryCount: extra.retryCount ?? extra.retry_count ?? item.retryCount,
          errorMessage: extra.errorMessage ?? item.errorMessage,
          youtubeVideoId: extra.youtubeVideoId ?? item.youtubeVideoId,
          updatedAt: new Date().toISOString()
        };
        if (status === 'processing') updated.startedAt = updated.startedAt || new Date().toISOString();
        if (status === 'completed') updated.completedAt = updated.completedAt || new Date().toISOString();
        return updated;
      });
      return data;
    });
    if (!updated) throw new Error('Kuyruk işi bulunamadı: ' + id);
    return updated;
  }

  remove(id) {
    let removed = null;
    this.store.update(data => {
      const rows = data.uploadQueue || [];
      removed = rows.find(item => item.id === id) || null;
      data.uploadQueue = rows.filter(item => item.id !== id || item.status === 'processing');
      return data;
    });
    if (!removed) throw new Error('Kuyruk işi bulunamadı: ' + id);
    return removed;
  }

  reorderQueue(id, newPriority) {
    return this.updateStatus(id, 'pending', { priority: Number(newPriority || 5) });
  }

  retryFailed(id) {
    return this.updateStatus(id, 'pending', { retryCount: 0, errorMessage: '' });
  }

  getDueJobs(now = new Date()) {
    return this.getQueue('pending', 500).filter(job => !job.scheduledTime || new Date(job.scheduledTime).getTime() <= now.getTime());
  }

  getOptimalUploadTimes(dayOfWeek = null) {
    const rows = this.store.get('smartSchedule', []);
    return rows
      .filter(row => dayOfWeek === null || row.dayOfWeek === dayOfWeek)
      .filter(row => row.sampleCount >= 1)
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 10);
  }

  learnOptimalTime(dateLike, metrics = {}) {
    const d = dateLike ? new Date(dateLike) : new Date();
    const dayOfWeek = d.getDay();
    const hour = d.getHours();
    const score = Number(metrics.engagementScore ?? ((metrics.views || 0) * 0.02 + (metrics.likes || 0) * 1.5 + (metrics.comments || 0) * 3));
    this.store.update(data => {
      data.smartSchedule = data.smartSchedule || [];
      let row = data.smartSchedule.find(x => x.dayOfWeek === dayOfWeek && x.hour === hour);
      if (!row) {
        row = { dayOfWeek, hour, engagementScore: 0, sampleCount: 0, updatedAt: new Date().toISOString() };
        data.smartSchedule.push(row);
      }
      row.engagementScore = ((row.engagementScore * row.sampleCount) + score) / (row.sampleCount + 1);
      row.sampleCount += 1;
      row.updatedAt = new Date().toISOString();
      return data;
    });
  }

  recordUpload(job, result = {}) {
    const history = {
      id: makeId('history'),
      queueId: job.id,
      youtubeVideoId: result.youtubeVideoId || result.id || '',
      title: job.title || result.title || '',
      status: result.status || 'success',
      uploadedAt: new Date().toISOString(),
      performanceData: result.performanceData || {}
    };
    this.store.push('uploadHistory', history, 2000);
    return history;
  }
}

function splitTags(value) {
  return String(value || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default QueueManager;
