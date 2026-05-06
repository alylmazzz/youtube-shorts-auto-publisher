import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { JsonStore } from '../utils/jsonStore.js';

const DEFAULT_HOOK_POINTS = [
  'video:beforeImport', 'video:afterImport',
  'video:beforeTranscribe', 'video:afterTranscribe',
  'video:beforeTitleGenerate', 'video:afterTitleGenerate',
  'video:beforeDescriptionGenerate', 'video:afterDescriptionGenerate',
  'video:beforeTagGenerate', 'video:afterTagGenerate',
  'video:beforeThumbnailGenerate', 'video:afterThumbnailGenerate',
  'video:beforeUpload', 'video:afterUpload', 'video:uploadSuccess', 'video:uploadFail',
  'video:beforeSchedule', 'video:afterSchedule',
  'token:beforeRefresh', 'token:afterRefresh', 'token:expired', 'token:error',
  'analytics:dailyReport', 'analytics:milestoneReached', 'analytics:performanceDrop',
  'system:startup', 'system:shutdown', 'system:error', 'system:healthCheck',
  'queue:itemAdded', 'queue:itemRemoved', 'queue:empty', 'queue:processingStart', 'queue:processingEnd',
  'content:duplicateDetected', 'content:qualityCheckFail', 'content:qualityCheckPass', 'content:optimized'
];

export class HookEngine {
  constructor({ dataDir, pluginDir } = {}) {
    this.hooks = new Map();
    this.middlewares = [];
    this.pluginRegistry = new Map();
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.pluginDir = pluginDir || path.join(process.cwd(), 'plugins');
    this.store = new JsonStore(path.join(this.dataDir, 'hooks.json'), {
      enabledPlugins: {},
      logs: [],
      hookPoints: DEFAULT_HOOK_POINTS
    });
    for (const hookPoint of DEFAULT_HOOK_POINTS) this.hooks.set(hookPoint, []);
  }

  get hookPoints() {
    return this.store.get('hookPoints', DEFAULT_HOOK_POINTS);
  }

  register(hookPoint, callback, priority = 10, pluginName = 'anonymous') {
    if (!this.hooks.has(hookPoint)) this.hooks.set(hookPoint, []);
    this.hooks.get(hookPoint).push({ callback, priority, pluginName, registeredAt: new Date().toISOString() });
    this.hooks.get(hookPoint).sort((a, b) => a.priority - b.priority);
  }

  use(middlewareFn) {
    this.middlewares.push(middlewareFn);
  }

  async execute(hookPoint, context = {}) {
    let result = { ...context };
    for (const middleware of this.middlewares) {
      try {
        result = await middleware(hookPoint, result) || result;
      } catch (error) {
        this.logHookExecution(hookPoint, 'middleware', 0, error);
      }
    }

    const handlers = this.hooks.get(hookPoint) || [];
    for (const handler of handlers) {
      const plugin = this.pluginRegistry.get(handler.pluginName);
      if (plugin && plugin.enabled === false) continue;
      const start = Date.now();
      try {
        const next = await handler.callback(result);
        if (next && typeof next === 'object') result = next;
        this.logHookExecution(hookPoint, handler.pluginName, Date.now() - start);
      } catch (error) {
        this.logHookExecution(hookPoint, handler.pluginName, Date.now() - start, error);
        if (hookPoint !== 'system:error') {
          await this.execute('system:error', { ...result, hookPoint, pluginName: handler.pluginName, error: error.message });
        }
      }
    }
    return result;
  }

  logHookExecution(hookPoint, pluginName, durationMs, error = null) {
    const entry = {
      id: makeId('hook'),
      hookPoint,
      pluginName,
      durationMs,
      ok: !error,
      error: error ? String(error.message || error) : null,
      executedAt: new Date().toISOString()
    };
    this.store.push('logs', entry, 500);
    return entry;
  }

  async loadBundledPlugins() {
    if (!fs.existsSync(this.pluginDir)) return [];
    const files = fs.readdirSync(this.pluginDir)
      .filter(name => name.endsWith('.plugin.js') || name.endsWith('.plugin.mjs'));
    const loaded = [];
    for (const file of files) {
      try {
        loaded.push(await this.loadPluginFromFile(path.join(this.pluginDir, file)));
      } catch (error) {
        this.logHookExecution('system:startup', file, 0, error);
      }
    }
    return loaded.filter(Boolean);
  }

  async loadPluginFromFile(filePath) {
    const mod = await import(pathToFileURL(filePath).href + '?v=' + Date.now());
    const plugin = mod.default || mod.plugin || mod;
    return this.loadPlugin(plugin, filePath);
  }

  loadPlugin(plugin, filePath = '') {
    if (!plugin?.name || typeof plugin.init !== 'function') {
      throw new Error('Plugin must have name and init(hooks)');
    }
    if (this.pluginRegistry.has(plugin.name)) return this.pluginRegistry.get(plugin.name);
    const enabledPlugins = this.store.get('enabledPlugins', {});
    const enabled = enabledPlugins[plugin.name] !== false;
    plugin.init(this);
    const info = {
      name: plugin.name,
      version: plugin.version || '1.0.0',
      description: plugin.description || '',
      filePath,
      enabled,
      loadedAt: new Date().toISOString(),
      hookCount: this.countPluginHooks(plugin.name)
    };
    this.pluginRegistry.set(plugin.name, { ...plugin, ...info });
    if (!(plugin.name in enabledPlugins)) {
      enabledPlugins[plugin.name] = enabled;
      this.store.set('enabledPlugins', enabledPlugins);
    }
    return info;
  }

  setPluginEnabled(pluginName, enabled) {
    const plugin = this.pluginRegistry.get(pluginName);
    if (!plugin) throw new Error('Plugin bulunamadı: ' + pluginName);
    plugin.enabled = Boolean(enabled);
    const enabledPlugins = this.store.get('enabledPlugins', {});
    enabledPlugins[pluginName] = Boolean(enabled);
    this.store.set('enabledPlugins', enabledPlugins);
    this.pluginRegistry.set(pluginName, plugin);
    return this.serializePlugin(plugin);
  }

  unloadPlugin(pluginName) {
    for (const [hookPoint, handlers] of this.hooks) {
      this.hooks.set(hookPoint, handlers.filter(h => h.pluginName !== pluginName));
    }
    const plugin = this.pluginRegistry.get(pluginName);
    if (plugin?.destroy) plugin.destroy();
    this.pluginRegistry.delete(pluginName);
  }

  countPluginHooks(pluginName) {
    let count = 0;
    for (const handlers of this.hooks.values()) {
      count += handlers.filter(h => h.pluginName === pluginName).length;
    }
    return count;
  }

  listPlugins() {
    return Array.from(this.pluginRegistry.values()).map(p => this.serializePlugin(p));
  }

  serializePlugin(plugin) {
    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      enabled: plugin.enabled !== false,
      loadedAt: plugin.loadedAt,
      hookCount: this.countPluginHooks(plugin.name)
    };
  }

  getLogs(limit = 100) {
    return this.store.get('logs', []).slice(-limit).reverse();
  }

  getStatus() {
    return {
      hookPoints: this.hookPoints,
      plugins: this.listPlugins(),
      recentLogs: this.getLogs(25)
    };
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default HookEngine;
