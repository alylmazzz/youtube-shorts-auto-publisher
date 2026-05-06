import path from 'path';
import { EventEmitter } from 'events';
import { JsonStore } from '../utils/jsonStore.js';

export class GamificationEngine extends EventEmitter {
  constructor({ dataDir, hooks } = {}) {
    super();
    this.hooks = hooks || null;
    this.store = new JsonStore(path.join(dataDir || path.join(process.cwd(), 'data'), 'gamification.json'), {
      profile: { level: 1, xp: 0, streak: 0, lastPublishDate: null, badges: [] },
      achievements: [],
      missions: this.defaultMissions()
    });
  }

  defaultMissions() {
    return [
      { id: 'first_upload', title: 'İlk Shorts Yayını', target: 1, metric: 'uploads', rewardXp: 100, completed: false },
      { id: 'three_day_streak', title: '3 Günlük Seri', target: 3, metric: 'streak', rewardXp: 250, completed: false },
      { id: 'seo_master', title: 'SEO Ustası', target: 10, metric: 'seoGenerated', rewardXp: 150, completed: false },
      { id: 'queue_builder', title: 'Kuyruk Mimarı', target: 20, metric: 'queued', rewardXp: 200, completed: false }
    ];
  }

  awardXp(amount, reason = '') {
    let profile;
    this.store.update(data => {
      data.profile.xp += Number(amount || 0);
      data.profile.level = Math.floor(data.profile.xp / 500) + 1;
      data.achievements.push({ id: makeId('xp'), type: 'xp', amount, reason, at: new Date().toISOString() });
      profile = data.profile;
      return data;
    });
    return profile;
  }

  onUploadSuccess(payload = {}) {
    const today = new Date().toISOString().slice(0, 10);
    let completed = [];
    this.store.update(data => {
      const profile = data.profile;
      if (profile.lastPublishDate) {
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        profile.streak = profile.lastPublishDate === yesterday ? profile.streak + 1 : (profile.lastPublishDate === today ? profile.streak : 1);
      } else {
        profile.streak = 1;
      }
      profile.lastPublishDate = today;
      profile.xp += 120;
      if (payload.seoScore >= 80) profile.xp += 40;
      profile.level = Math.floor(profile.xp / 500) + 1;
      data.achievements.push({ id: makeId('ach'), type: 'upload_success', payload, at: new Date().toISOString() });
      completed = this.evaluateMissions(data, { uploads: 1, streak: profile.streak, seoGenerated: 0, queued: 0 });
      return data;
    });
    completed.forEach(m => this.emit('missionCompleted', m));
    return this.getStats();
  }

  onSeoGenerated() {
    this.awardXp(15, 'SEO paketi üretildi');
    this.store.update(data => {
      this.evaluateMissions(data, { uploads: 0, streak: data.profile.streak, seoGenerated: 1, queued: 0 });
      return data;
    });
    return this.getStats();
  }

  onQueued() {
    this.awardXp(5, 'Kuyruğa video eklendi');
    this.store.update(data => {
      this.evaluateMissions(data, { uploads: 0, streak: data.profile.streak, seoGenerated: 0, queued: 1 });
      return data;
    });
    return this.getStats();
  }

  evaluateMissions(data, delta) {
    const completed = [];
    for (const mission of data.missions) {
      mission.progress ||= 0;
      if (mission.completed) continue;
      if (mission.metric === 'streak') mission.progress = Math.max(mission.progress, delta.streak || 0);
      else mission.progress += Number(delta[mission.metric] || 0);
      if (mission.progress >= mission.target) {
        mission.completed = true;
        mission.completedAt = new Date().toISOString();
        data.profile.xp += mission.rewardXp;
        data.profile.badges = [...new Set([...(data.profile.badges || []), mission.id])];
        completed.push(mission);
      }
    }
    data.profile.level = Math.floor(data.profile.xp / 500) + 1;
    return completed;
  }

  getStats() {
    const data = this.store.get();
    const profile = data.profile;
    const xpForLevel = profile.level * 500;
    const currentLevelStart = (profile.level - 1) * 500;
    return {
      profile: {
        ...profile,
        nextLevelXp: xpForLevel,
        levelProgressPct: Math.round(((profile.xp - currentLevelStart) / 500) * 100)
      },
      missions: data.missions,
      recentAchievements: data.achievements.slice(-20).reverse()
    };
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default GamificationEngine;
