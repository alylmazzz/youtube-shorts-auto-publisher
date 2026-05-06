import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export default {
  name: 'watermark',
  version: '1.0.0',
  description: 'assets/watermark.png varsa video işleme aşamasında watermark için çıktı yolu hazırlar.',
  init(hooks) {
    hooks.register('video:afterImport', async (context) => {
      const watermarkPath = path.join(process.cwd(), 'assets', 'watermark.png');
      if (!context.videoPath || !fs.existsSync(watermarkPath) || context.skipWatermark) return context;
      const outputPath = context.videoPath.replace(/\.(mp4|mov|m4v|webm)$/i, '_wm.mp4');
      try {
        await this.applyWatermark(context.videoPath, watermarkPath, outputPath);
        return { ...context, videoPath: outputPath, watermarkApplied: true };
      } catch (error) {
        return { ...context, watermarkApplied: false, watermarkWarning: error.message };
      }
    }, 3, 'watermark');
  },
  applyWatermark(inputPath, watermarkPath, outputPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-y', '-i', inputPath, '-i', watermarkPath,
        '-filter_complex', 'overlay=W-w-18:H-h-18:enable=between(t\\,0\\,6)',
        '-c:a', 'copy', outputPath
      ];
      const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      ff.stderr.on('data', d => { err += d.toString(); });
      ff.on('error', reject);
      ff.on('close', code => code === 0 ? resolve(outputPath) : reject(new Error(err.slice(-800) || 'ffmpeg watermark failed')));
    });
  }
};
