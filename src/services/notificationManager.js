import path from 'path';
import { JsonStore } from '../utils/jsonStore.js';

export class NotificationManager {
  constructor({ dataDir } = {}) {
    this.store = new JsonStore(path.join(dataDir || path.join(process.cwd(), 'data'), 'notifications.json'), {
      notifications: [],
      settings: { browser: true, webhookUrl: '', email: '' }
    });
  }

  notify(type, title, message, payload = {}) {
    const notification = { id: makeId('note'), type, title, message, payload, read: false, createdAt: new Date().toISOString() };
    this.store.push('notifications', notification, 1000);
    return notification;
  }

  list(limit = 50) {
    return this.store.get('notifications', []).slice(-limit).reverse();
  }

  markRead(id) {
    this.store.update(data => {
      const item = data.notifications.find(n => n.id === id);
      if (item) item.read = true;
      return data;
    });
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default NotificationManager;
