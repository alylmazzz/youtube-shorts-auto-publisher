import path from 'path';
import { EventEmitter } from 'events';
import { JsonStore } from '../utils/jsonStore.js';

export class PipelineManager extends EventEmitter {
  constructor({ contentPipeline, videoProcessor, queueManager, analytics, gamification, hooks, dataDir } = {}) {
    super();
    this.contentPipeline = contentPipeline;
    this.videoProcessor = videoProcessor;
    this.queueManager = queueManager;
    this.analytics = analytics;
    this.gamification = gamification;
    this.hooks = hooks;
    this.store = new JsonStore(path.join(dataDir || path.join(process.cwd(), 'data'), 'pipeline.json'), { sessions: [] });
  }

  async prepareUpload({ transcript = '', videoPath = '', videoName = '', metadata = {}, options = {}, addToQueue = false } = {}) {
    const session = { id: makeId('pipe'), videoPath, videoName, startedAt: new Date().toISOString(), status: 'running' };
    let videoReport = null;
    let content = null;
    try {
      if (videoPath || Object.keys(metadata).length) {
        videoReport = await this.videoProcessor.analyzeFile(videoPath, { ...metadata, originalName: videoName });
      }
      content = await this.contentPipeline.generateFullContent(transcript || videoName, { ...options, videoName });
      await this.analytics?.track('seo_generated', { sessionId: session.id, seoScore: content.seoScore?.percentage, title: content.readyToCopy?.title });
      this.gamification?.onSeoGenerated();
      let queuedJob = null;
      if (addToQueue) {
        queuedJob = await this.queueManager.addToQueue({
          videoPath,
          videoName,
          title: content.readyToCopy.title,
          description: content.readyToCopy.description,
          tags: content.tags.list,
          category: content.category.id,
          metadata: { pipelineSessionId: session.id, videoReport, content }
        });
        this.gamification?.onQueued();
      }
      Object.assign(session, { status: 'completed', completedAt: new Date().toISOString(), content, videoReport, queuedJob });
      this.store.push('sessions', session, 500);
      this.emit('prepared', session);
      return session;
    } catch (error) {
      Object.assign(session, { status: 'failed', error: error.message, completedAt: new Date().toISOString(), content, videoReport });
      this.store.push('sessions', session, 500);
      throw error;
    }
  }

  getSessions(limit = 30) {
    return this.store.get('sessions', []).slice(-limit).reverse();
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default PipelineManager;
