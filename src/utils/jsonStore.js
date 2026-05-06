import fs from 'fs';
import path from 'path';

export class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.ensureDir();
    this.data = this.load();
  }

  ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.save(this.defaults);
        return structuredCloneSafe(this.defaults);
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      return deepMerge(structuredCloneSafe(this.defaults), parsed);
    } catch (error) {
      const backup = this.filePath + '.corrupt-' + Date.now();
      try { fs.copyFileSync(this.filePath, backup); } catch {}
      this.save(this.defaults);
      return structuredCloneSafe(this.defaults);
    }
  }

  save(next = this.data) {
    this.ensureDir();
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    this.data = next;
    return this.data;
  }

  get(key, fallback = undefined) {
    return key ? getByPath(this.data, key, fallback) : this.data;
  }

  set(key, value) {
    setByPath(this.data, key, value);
    return this.save();
  }

  update(mutator) {
    const next = mutator(this.data) || this.data;
    return this.save(next);
  }

  push(key, item, limit = 1000) {
    const arr = this.get(key, []);
    arr.push(item);
    while (arr.length > limit) arr.shift();
    this.set(key, arr);
    return item;
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = deepMerge(base[key] || {}, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

function getByPath(obj, key, fallback) {
  const parts = String(key).split('.');
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return fallback;
    cur = cur[part];
  }
  return cur;
}

function setByPath(obj, key, value) {
  const parts = String(key).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}
