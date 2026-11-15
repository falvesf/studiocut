import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  probeMedia,
  transcribeWhisper,
  detectSilences,
  executeRender,
  generateSrtContent,
  generateQuickPreview,
  extractAudio,
  transcodeToWebCompatible,
  detectHardwareCapabilities
} from './ffmpegHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const MODELS_DIR = path.join(ROOT_DIR, 'models');
const WHISPER_MODEL = path.join(MODELS_DIR, 'ggml-base.bin');

[UPLOADS_DIR, OUTPUT_DIR, MODELS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Serve uploaded and rendered files with HTTP Range support for video scrubbing
app.use('/media', express.static(UPLOADS_DIR));
app.use('/output', express.static(OUTPUT_DIR));

// Serve Frontend Build
const DIST_DIR = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// Setup multer with clean UTF-8 name sanitization
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    let originalUtf8 = file.originalname;
    try {
      originalUtf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    const ext = path.extname(originalUtf8).toLowerCase();
    const base = path.basename(originalUtf8, ext)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 36);

    cb(null, `${base || 'media'}_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// System & Hardware Status Endpoint (Auto-Detects GPU, NVENC, QSV, AMF, CPU)
app.get('/api/status', async (req, res) => {
  try {
    const hasWhisperModel = fs.existsSync(WHISPER_MODEL);
    const hw = await detectHardwareCapabilities();
    res.json({
      status: 'online',
      whisperModelLoaded: hasWhisperModel,
      gpuAcceleration: hw.encoderLabel,
      gpuName: hw.gpuName,
      encoder: hw.encoder,
      encoderType: hw.encoderType,
      encoderLabel: hw.encoderLabel,
      isHardwareAccelerated: hw.isHardwareAccelerated,
      ffmpegAvailable: true
    });
  } catch (err) {
    res.json({
      status: 'online',
      whisperModelLoaded: false,
      gpuAcceleration: 'CPU Multi-Core',
      gpuName: 'Processador Universal',
      encoder: 'libx264',
      encoderType: 'cpu',
      encoderLabel: 'CPU Multi-Core',
      isHardwareAccelerated: false,
      ffmpegAvailable: true
    });
  }
});

app.get('/api/system-info', async (req, res) => {
  const hw = await detectHardwareCapabilities();
  res.json({ success: true, ...hw });
});

// List all files in uploads directory (Media Pool)
app.get('/api/media', async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const mediaList = [];

    for (const f of files) {
      const fullPath = path.join(UPLOADS_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        const ext = path.extname(f).toLowerCase();
        if (!['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
          continue;
        }

        let info = { duration: 0, width: 0, height: 0, hasVideo: false, hasAudio: false };
        try {
          info = await probeMedia(fullPath);
        } catch (e) {}

        // Determine accurate media type from probe
        let type = 'video';
        if (['.mp3', '.wav', '.aac', '.m4a', '.ogg'].includes(ext) || (!info.hasVideo && info.hasAudio)) {
          type = 'audio';
        } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && (!info.hasVideo || info.duration <= 0.05 || info.fps <= 1)) {
          type = 'image';
        } else {
          type = 'video';
        }

        // If file is HEVC and an _h264 or web_ exists, skip the unplayable raw HEVC
        if (type === 'video' && info.codec === 'hevc') {
          const webVariant = files.find(candidate => candidate.includes(path.basename(f, ext)) && (candidate.includes('_h264') || candidate.startsWith('web_')));
          if (webVariant) {
            continue; // Skip the raw hevc in favor of the web variant
          }
        }

        const friendlyName = f.replace(/_\d+\.[^.]+$/, ext);

        mediaList.push({
          id: f,
          name: friendlyName,
          filename: f,
          path: fullPath,
          url: `/media/${encodeURIComponent(f)}`,
          type,
          duration: info.duration || 0,
          width: info.width || 0,
          height: info.height || 0,
          size: stat.size,
          mtime: stat.mtimeMs
        });
      } catch (err) {}
    }

    mediaList.sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, media: mediaList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete media file from uploads directory
app.delete('/api/media/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      res.json({ success: true, message: 'Arquivo excluído com sucesso.' });
    } else {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Video, Audio, or Image File (Auto-Transcodes non-browser codecs like HEVC via NVENC)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    let originalUtf8 = req.file.originalname;
    try {
      originalUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    let filePath = req.file.path;
    let filename = req.file.filename;
    let info = await probeMedia(filePath);

    const ext = path.extname(filename).toLowerCase();
    let type = 'video';
    if (['.mp3', '.wav', '.aac', '.m4a', '.ogg'].includes(ext) || (!info.hasVideo && info.hasAudio)) {
      type = 'audio';
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && (!info.hasVideo || info.duration <= 0.05 || info.fps <= 1)) {
      type = 'image';
    } else {
      type = 'video';
    }

    // AUTO-TRANSCODE FOR FULL BROWSER PLAYABILITY:
    // If video is HEVC, MPEG-4, WMV, ProRes, AVI, MKV, or has incompatible pixel format/audio codec:
    const isBrowserCompatible = info.codec === 'h264' &&
      ['yuv420p', 'yuvj420p'].includes(info.pixFmt) &&
      ext === '.mp4' &&
      (!info.hasAudio || ['aac', 'mp3'].includes(info.audioCodec));

    if (type === 'video' && !isBrowserCompatible) {
      console.log(`[Upload] Vídeo com codec incompatível com navegador (${info.codec}, ${info.pixFmt}). Transcodificando via RTX 4070 NVENC...`);
      const webFilename = `web_${path.basename(filename, ext)}.mp4`;
      const webPath = path.join(UPLOADS_DIR, webFilename);

      try {
        await transcodeToWebCompatible(filePath, webPath);
        if (fs.existsSync(webPath) && fs.statSync(webPath).size > 1000) {
          filePath = webPath;
          filename = webFilename;
          info = await probeMedia(webPath);
          console.log(`[Upload] Transcodificação para H.264 concluída com sucesso: ${webFilename}`);
        }
      } catch (transcodeErr) {
        console.error('[Upload] Erro durante transcodificação web:', transcodeErr);
      }
    }

    res.json({
      success: true,
      filename,
      originalName: originalUtf8,
      path: filePath,
      url: `/media/${encodeURIComponent(filename)}`,
      type,
      size: fs.statSync(filePath).size,
      info
    });
  } catch (err) {
    console.error('Erro no upload/probe:', err);
    res.status(500).json({ error: err.message });
  }
});

// Probe existing file
app.get('/api/probe', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  try {
    const info = await probeMedia(filePath);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whisper AI Transcription
app.post('/api/transcribe', async (req, res) => {
  const { filePath, language = 'pt' } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Arquivo de vídeo não encontrado' });
  }

  if (!fs.existsSync(WHISPER_MODEL)) {
    return res.status(400).json({ error: 'Modelo Whisper não encontrado em models/ggml-base.bin' });
  }

  try {
    console.log(`[Whisper] Iniciando transcrição de: ${filePath}`);
    const subtitles = await transcribeWhisper(filePath, WHISPER_MODEL, language);
    console.log(`[Whisper] Transcrição concluída com ${subtitles.length} legendas`);
    res.json({ success: true, subtitles });
  } catch (err) {
    console.error('[Whisper] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Silence Detection (Auto-cut silences)
app.post('/api/silences', async (req, res) => {
  const { filePath, noiseDb = -30, minDuration = 0.5 } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Arquivo não encontrado' });
  }

  try {
    const silences = await detectSilences(filePath, noiseDb, minDuration);
    res.json({ success: true, silences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export SRT file directly
app.post('/api/export-srt', (req, res) => {
  const { subtitles, filename = 'legendas.srt' } = req.body;
  if (!subtitles || !Array.isArray(subtitles)) {
    return res.status(400).json({ error: 'Legendas inválidas' });
  }

  const srtContent = generateSrtContent(subtitles);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(srtContent);
});

// Extract Audio from video file
app.post('/api/extract-audio', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Arquivo de vídeo não encontrado' });
  }

  const audioFilename = `extracted_${Date.now()}.mp3`;
  const outputAudio = path.join(UPLOADS_DIR, audioFilename);

  try {
    await extractAudio(filePath, outputAudio);
    const info = await probeMedia(outputAudio);
    res.json({
      success: true,
      filename: audioFilename,
      path: outputAudio,
      url: `/media/${audioFilename}`,
      duration: info.duration
    });
  } catch (err) {
    console.error('Erro ao extrair áudio:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate Quick 3s Preview
app.post('/api/preview', async (req, res) => {
  const { inputVideo, startTime = 0, enhancement = 'whatsapp_turbo' } = req.body;
  if (!inputVideo || !fs.existsSync(inputVideo)) {
    return res.status(400).json({ error: 'Vídeo não encontrado' });
  }
  const previewFilename = `preview_${Date.now()}.mp4`;
  const outputVideo = path.join(OUTPUT_DIR, previewFilename);

  try {
    await generateQuickPreview({ inputVideo, startTime, enhancement, outputVideo });
    res.json({ success: true, url: `/output/${previewFilename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Render Video with SSE Progress Updates
app.post('/api/render', async (req, res) => {
  const options = req.body;
  const { inputVideo } = options;

  if (!inputVideo || !fs.existsSync(inputVideo)) {
    return res.status(400).json({ error: 'Arquivo de entrada inexistente' });
  }

  // Setup Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('status', { message: 'Iniciando renderização...' });

  const outFilename = `StudioCut_Export_${Date.now()}.mp4`;
  const outputVideo = path.join(OUTPUT_DIR, outFilename);

  try {
    const result = await executeRender({
      ...options,
      outputVideo,
      onProgress: (prog) => {
        sendEvent('progress', prog);
      }
    });

    sendEvent('done', {
      success: true,
      filename: outFilename,
      url: `/output/${outFilename}`,
      outputPath: result.outputPath
    });
    res.end();
  } catch (err) {
    console.error('Erro na renderização:', err);
    sendEvent('error', { error: err.message });
    res.end();
  }
});

// SPA fallback for frontend routes
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/media') || req.path.startsWith('/output')) {
    return next();
  }
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Servidor StudioCut rodando em http://localhost:${PORT}`);
});
