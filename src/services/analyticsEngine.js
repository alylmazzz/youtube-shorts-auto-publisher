import path from 'path';
import { JsonStore } from '../utils/jsonStore.js';

export class AnalyticsEngine {
  constructor({ dataDir, hooks } = {}) {
    this.hooks = hooks || null;
    this.store = new JsonStore(path.join(dataDir || path.join(process.cwd(), 'data'), 'analytics.json'), {
      events: [],
      dailyReports: [],
      milestones: []
    });
  }

  async track(eventType, payload = {}) {
    const event = { id: makeId('evt'), eventType, payload, createdAt: new Date().toISOString() };
    this.store.push('events', event, 5000);
    if (this.hooks) {
      if (eventType === 'upload_success') await this.hooks.execute('video:uploadSuccess', payload);
      if (eventType === 'milestone') await this.hooks.execute('analytics:milestoneReached', payload);
    }
    return event;
  }

  summary(days = 30) {
    const since = Date.now() - days * 86_400_000;
    const events = this.store.get('events', []).filter(e => new Date(e.createdAt).getTime() >= since);
    const uploads = events.filter(e => e.eventType === 'upload_success');
    const failures = events.filter(e => e.eventType === 'upload_failed');
    const seo = events.filter(e => e.eventType === 'seo_generated');
    const views = uploads.reduce((sum, e) => sum + Number(e.payload?.views || e.payload?.metrics?.views || 0), 0);
    const likes = uploads.reduce((sum, e) => sum + Number(e.payload?.likes || e.payload?.metrics?.likes || 0), 0);
    const byDay = {};
    for (const event of events) {
      const key = event.createdAt.slice(0, 10);
      byDay[key] ||= { date: key, events: 0, uploads: 0, failures: 0, seoGenerated: 0 };
      byDay[key].events += 1;
      if (event.eventType === 'upload_success') byDay[key].uploads += 1;
      if (event.eventType === 'upload_failed') byDay[key].failures += 1;
      if (event.eventType === 'seo_generated') byDay[key].seoGenerated += 1;
    }
    return {
      days,
      totalEvents: events.length,
      uploads: uploads.length,
      failures: failures.length,
      seoGenerated: seo.length,
      successRate: uploads.length + failures.length ? Math.round((uploads.length / (uploads.length + failures.length)) * 100) : 0,
      views,
      likes,
      daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      lastEvents: events.slice(-20).reverse()
    };
  }

  createDailyReport(date = new Date()) {
    const key = date.toISOString().slice(0, 10);
    const report = { id: makeId('report'), date: key, summary: this.summary(1), createdAt: new Date().toISOString() };
    this.store.push('dailyReports', report, 365);
    return report;
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default AnalyticsEngine;
