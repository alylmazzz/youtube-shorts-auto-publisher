import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { JsonStore } from '../utils/jsonStore.js';

export class VideoProcessor extends EventEmitter {
  constructor({ dataDir, hooks } = {}) {
    super();
    this.hooks = hooks || null;
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.outputDir = path.join(process.cwd(), 'processed');
    fs.mkdirSync(this.outputDir, { recursive: true });
    this.store = new JsonStore(path.join(this.dataDir, 'video_processor.json'), {
      jobs: [],
      qualityReports: [],
      presets: {
        shorts: { width: 1080, height: 1920, fps: 30, maxDuration: 60, videoBitrate: '4500k', audioBitrate: '128k' }
      }
    });
  }

  setHookEngine(hooks) { this.hooks = hooks; }

  async analyzeFile(filePath, metadata = {}) {
    const report = {
      id: makeId('video'),
      filePath,
      fileName: metadata.originalName || path.basename(filePath || ''),
      createdAt: new Date().toISOString(),
      exists: Boolean(filePath && fs.existsSync(filePath)),
      probe: null,
      scenes: [],
      audio: {},
      quality: {},
      shorts: {},
      warnings: [],
      suggestions: []
    };

    if (!report.exists) {
      report.warnings.push('Video dosyası bulunamadı; yalnızca metadata tabanlı analiz yapıldı.');
      report.shorts = this.validateShortsMetadata(metadata);
      this.saveReport(report);
      return report;
    }

    report.probe = await this.ffprobe(filePath).catch(error => ({ error: error.message }));
    report.shorts = this.validateShortsFromProbe(report.probe, metadata);
    report.quality = this.analyzeQuality(report.probe, metadata);
    report.audio = this.analyzeAudio(report.probe);
    report.scenes = this.estimateScenes(report.probe);
    report.suggestions = this.buildSuggestions(report);
    this.saveReport(report);
    return report;
  }

  async processShorts(inputPath, options = {}) {
    let context = { inputPath, options, startedAt: Date.now() };
    if (this.hooks) context = await this.hooks.execute('video:beforeImport', context);
    if (this.hooks) context = await this.hooks.execute('video:afterImport', context);
    const currentInput = context.videoPath || context.inputPath || inputPath;
    const preset = { ...this.store.get('presets.shorts'), ...(options.preset || {}) };
    const outputPath = options.outputPath || path.join(this.outputDir, `${path.parse(currentInput).name}_shorts_${Date.now()}.mp4`);
    const filters = [];

    if (options.forceVertical !== false) {
      filters.push(`scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase`);
      filters.push(`crop=${preset.width}:${preset.height}`);
    }
    if (options.brightness) filters.push(`eq=brightness=${Number(options.brightness) || 0}`);
    if (options.saturation) filters.push(`eq=saturation=${Number(options.saturation) || 1}`);

    const args = ['-y', '-i', currentInput];
    if (options.startTime) args.push('-ss', String(options.startTime));
    if (options.duration) args.push('-t', String(options.duration));
    if (filters.length) args.push('-vf', filters.join(','));
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-b:v', preset.videoBitrate, '-c:a', 'aac', '-b:a', preset.audioBitrate, '-movflags', '+faststart', outputPath);

    await this.runCommand('ffmpeg', args);
    const report = await this.analyzeFile(outputPath, { originalName: path.basename(outputPath) });
    const job = { id: makeId('process'), inputPath, outputPath, options, report, completedAt: new Date().toISOString(), durationMs: Date.now() - context.startedAt };
    this.store.push('jobs', job, 500);
    this.emit('processed', job);
    return job;
  }

  async renderSubtitles(inputPath, subtitles = [], options = {}) {
    const srtPath = path.join(this.outputDir, `${path.parse(inputPath).name}_${Date.now()}.srt`);
    const outputPath = options.outputPath || path.join(this.outputDir, `${path.parse(inputPath).name}_subtitled_${Date.now()}.mp4`);
    fs.writeFileSync(srtPath, toSrt(subtitles), 'utf8');
    const safeSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const style = options.forceStyle || 'Fontsize=20,Outline=2,Shadow=1,Alignment=2,MarginV=140';
    await this.runCommand('ffmpeg', ['-y', '-i', inputPath, '-vf', `subtitles='${safeSrt}':force_style='${style}'`, '-c:a', 'copy', outputPath]);
    return { srtPath, outputPath };
  }

  async generateThumbnail(inputPath, options = {}) {
    const outputPath = options.outputPath || path.join(this.outputDir, `${path.parse(inputPath).name}_thumb_${Date.now()}.jpg`);
    const at = options.at || '00:00:01';
    await this.runCommand('ffmpeg', ['-y', '-ss', at, '-i', inputPath, '-frames:v', '1', '-q:v', '2', outputPath]);
    return { outputPath, at };
  }

  async ffprobe(filePath) {
    const raw = await this.runCommand('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath], { captureStdout: true });
    return JSON.parse(raw.stdout || '{}');
  }

  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', options.captureStdout ? 'pipe' : 'ignore', 'pipe'] });
      let stdout = '';
      let stderr = '';
      if (child.stdout) child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });
      child.on('error', error => reject(new Error(`${command} çalıştırılamadı: ${error.message}. FFmpeg/FFprobe kurulu mu?`)));
      child.on('close', code => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr.slice(-1200) || `${command} exit code ${code}`));
      });
    });
  }

  validateShortsMetadata(metadata = {}) {
    const duration = Number(metadata.duration || metadata.durationSeconds || 0);
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const ratio = width && height ? width / height : null;
    const warnings = [];
    const errors = [];
    if (duration && duration > 60) errors.push('Shorts süresi 60 saniyeyi aşıyor.');
    if (ratio && (ratio < 0.50 || ratio > 0.70)) warnings.push('Dikey Shorts oranı dışında görünüyor.');
    return { ok: errors.length === 0, duration, width, height, ratio, warnings, errors };
  }

  validateShortsFromProbe(probe = {}, metadata = {}) {
    const video = (probe.streams || []).find(s => s.codec_type === 'video') || {};
    const format = probe.format || {};
    const width = Number(video.width || metadata.width || 0);
    const height = Number(video.height || metadata.height || 0);
    const duration = Number(format.duration || video.duration || metadata.duration || 0);
    return this.validateShortsMetadata({ width, height, duration });
  }

  analyzeQuality(probe = {}, metadata = {}) {
    const video = (probe.streams || []).find(s => s.codec_type === 'video') || {};
    const width = Number(video.width || metadata.width || 0);
    const height = Number(video.height || metadata.height || 0);
    const bitRate = Number(video.bit_rate || probe.format?.bit_rate || 0);
    const fps = parseRate(video.avg_frame_rate || video.r_frame_rate);
    let score = 65;
    const checks = [];
    const add = (ok, points, label) => { if (ok) score += points; checks.push({ label, ok, points: ok ? points : 0 }); };
    add(width >= 720 && height >= 1280, 12, 'HD dikey çözünürlük');
    add(width === 1080 && height === 1920, 8, '1080x1920 ideal Shorts');
    add(fps >= 24 && fps <= 60, 6, 'FPS uygun');
    add(bitRate === 0 || bitRate >= 2_000_000, 6, 'Bitrate yeterli');
    return { score: Math.min(100, score), width, height, fps, bitRate, checks };
  }

  analyzeAudio(probe = {}) {
    const audio = (probe.streams || []).find(s => s.codec_type === 'audio') || {};
    return {
      hasAudio: Boolean(audio.codec_name),
      codec: audio.codec_name || '',
      sampleRate: Number(audio.sample_rate || 0),
      channels: Number(audio.channels || 0),
      bitRate: Number(audio.bit_rate || 0),
      suggestions: audio.codec_name ? [] : ['Video sessiz görünüyor; transkripsiyon ve retention düşebilir.']
    };
  }

  estimateScenes(probe = {}) {
    const duration = Number(probe.format?.duration || 0);
    if (!duration) return [];
    const step = duration <= 15 ? 3 : duration <= 30 ? 5 : 8;
    const scenes = [];
    for (let t = 0; t < Math.min(duration, 60); t += step) {
      scenes.push({ start: Number(t.toFixed(1)), end: Number(Math.min(t + step, duration).toFixed(1)), label: `Tahmini sahne ${scenes.length + 1}` });
    }
    return scenes;
  }

  buildSuggestions(report) {
    const suggestions = [];
    if (!report.shorts.ok) suggestions.push({ priority: 'high', text: 'Süre veya format Shorts kriterine uymuyor; 9:16 ve 60 saniye altına getir.' });
    if (report.shorts.ratio && (report.shorts.ratio < 0.50 || report.shorts.ratio > 0.70)) suggestions.push({ priority: 'high', text: 'Videoyu 1080x1920 dikey formata crop/scale et.' });
    if (report.quality.score < 80) suggestions.push({ priority: 'medium', text: 'Kalite skorunu artırmak için 1080x1920, 24-60fps ve yeterli bitrate kullan.' });
    if (!report.audio.hasAudio) suggestions.push({ priority: 'medium', text: 'Ses bulunamadı; otomatik transkript ve izlenme tutma etkilenir.' });
    return suggestions;
  }

  saveReport(report) {
    this.store.push('qualityReports', report, 500);
  }

  getRecentReports(limit = 30) {
    return this.store.get('qualityReports', []).slice(-limit).reverse();
  }
}

function parseRate(rate = '') {
  if (!rate || rate === '0/0') return 0;
  const [a, b] = String(rate).split('/').map(Number);
  return b ? a / b : Number(rate) || 0;
}

function toSrt(items = []) {
  return items.map((item, index) => {
    const start = secondsToSrtTime(item.start || 0);
    const end = secondsToSrtTime(item.end || (item.start || 0) + 2);
    return `${index + 1}\n${start} --> ${end}\n${String(item.text || '').trim()}\n`;
  }).join('\n');
}

function secondsToSrtTime(value) {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default VideoProcessor;
