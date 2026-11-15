import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');
const WHISPER_MODEL = path.join(MODELS_DIR, 'ggml-base.bin');

[UPLOADS_DIR, OUTPUT_DIR, MODELS_DIR, PROJECTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

const uploadProgressClients = new Map();
const MEDIA_INDEX_FILE = path.join(UPLOADS_DIR, '_media_index.json');

function loadMediaIndex() {
  try {
    if (fs.existsSync(MEDIA_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveMediaIndex(index) {
  try {
    fs.writeFileSync(MEDIA_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
  } catch (e) {}
}

function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function sendUploadProgress(uploadId, payload) {
  if (!uploadId) return;
  const res = uploadProgressClients.get(uploadId);
  if (res) {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {}
  }
}

app.get('/api/upload-progress/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  uploadProgressClients.set(uploadId, res);
  req.on('close', () => {
    uploadProgressClients.delete(uploadId);
  });
});

// Upload Video, Audio, or Image File (Auto-Transcodes non-browser codecs like HEVC via Hardware/CPU)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const uploadId = req.query.uploadId ? String(req.query.uploadId) : null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    let originalUtf8 = req.file.originalname;
    try {
      originalUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    sendUploadProgress(uploadId, {
      stage: 'probing',
      percent: 5,
      message: 'Analisando codec e formato do arquivo...'
    });

    let filePath = req.file.path;
    let filename = req.file.filename;

    // Deduplication check by SHA-256 hash
    const fileHash = await computeFileHash(filePath);
    const mediaIndex = loadMediaIndex();
    const cached = mediaIndex[fileHash];
    if (cached && cached.path && fs.existsSync(cached.path)) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
      console.log(`[Upload] Arquivo duplicado detectado (hash ${fileHash.slice(0, 8)}). Reutilizando: ${cached.filename}`);
      sendUploadProgress(uploadId, {
        stage: 'done',
        percent: 100,
        message: 'Mídia já importada anteriormente! Reutilizando arquivo sem duplicar.'
      });
      return res.json({
        ...cached,
        success: true,
        reused: true,
        originalName: originalUtf8 || cached.originalName
      });
    }

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
      const codecName = (info.codec || ext.replace('.', '') || 'desconhecido').toUpperCase();
      console.log(`[Upload] Vídeo com codec incompatível com navegador (${info.codec}, ${info.pixFmt}). Transcodificando via hardware...`);
      const webFilename = `web_${path.basename(filename, ext)}.mp4`;
      const webPath = path.join(UPLOADS_DIR, webFilename);

      sendUploadProgress(uploadId, {
        stage: 'transcoding',
        percent: 1,
        codec: codecName,
        message: `Codec ${codecName} detectado. Iniciando decodificação por hardware para o player...`
      });

      try {
        await transcodeToWebCompatible(
          filePath,
          webPath,
          ({ percent, encoderLabel }) => {
            sendUploadProgress(uploadId, {
              stage: 'transcoding',
              percent,
              codec: codecName,
              encoder: encoderLabel,
              message: `Decodificando codec ${codecName} via ${encoderLabel}... ${percent}%`
            });
          },
          info.duration || 0
        );
        if (fs.existsSync(webPath) && fs.statSync(webPath).size > 1000) {
          // Remove raw incompatible original so uploads/ doesn't keep duplicate raw+web copies
          try {
            if (filePath !== webPath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {}
          filePath = webPath;
          filename = webFilename;
          info = await probeMedia(webPath);
          console.log(`[Upload] Transcodificação para H.264 concluída com sucesso: ${webFilename}`);
        }
      } catch (transcodeErr) {
        console.error('[Upload] Erro durante transcodificação web:', transcodeErr);
      }
    }

    const resultPayload = {
      success: true,
      reused: false,
      filename,
      originalName: originalUtf8,
      path: filePath,
      url: `/media/${encodeURIComponent(filename)}`,
      type,
      size: fs.statSync(filePath).size,
      info
    };

    mediaIndex[fileHash] = resultPayload;
    saveMediaIndex(mediaIndex);

    sendUploadProgress(uploadId, {
      stage: 'done',
      percent: 100,
      message: 'Vídeo pronto no player!'
    });

    res.json(resultPayload);
  } catch (err) {
    console.error('Erro no upload/probe:', err);
    sendUploadProgress(uploadId, { stage: 'error', message: err.message });
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
  const { filePath, startTime = null, endTime = null } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Arquivo de vídeo não encontrado' });
  }

  const audioFilename = `extracted_${Date.now()}.mp3`;
  const outputAudio = path.join(UPLOADS_DIR, audioFilename);

  try {
    await extractAudio(filePath, outputAudio, startTime, endTime);
    const info = await probeMedia(outputAudio);
    res.json({
      success: true,
      filename: audioFilename,
      path: outputAudio,
      url: `/media/${encodeURIComponent(audioFilename)}`,
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

// ============================================================
// FREE ONLINE STOCK MEDIA SEARCH & IMPORT (Openverse, Wikimedia, optional Pixabay)
// ============================================================
app.get('/api/stock/search', async (req, res) => {
  const type = String(req.query.type || 'audio');
  const q = String(req.query.q || 'music').trim() || 'nature';
  const pixabayKey = String(req.query.pixabayKey || '').trim();

  try {
    if (pixabayKey && (type === 'video' || type === 'image')) {
      const endpoint = type === 'video'
        ? `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&per_page=18`
        : `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(q)}&per_page=18&image_type=photo`;
      const resp = await fetch(endpoint);
      const json = await resp.json();
      if (!resp.ok) {
        return res.status(400).json({ error: json?.message || 'Chave Pixabay inválida ou limite atingido.' });
      }
      const items = (json.hits || []).map((h) => {
        if (type === 'video') {
          const vidUrl = h.videos?.medium?.url || h.videos?.small?.url || h.videos?.large?.url;
          const thumb = h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || '';
          return {
            id: `px_v_${h.id}`,
            title: h.tags || `Pixabay Video ${h.id}`,
            author: h.user || 'Pixabay',
            duration: h.duration || 0,
            thumbnail: thumb,
            url: vidUrl,
            width: h.videos?.medium?.width || 1280,
            height: h.videos?.medium?.height || 720,
            source: 'Pixabay'
          };
        }
        return {
          id: `px_i_${h.id}`,
          title: h.tags || `Pixabay Photo ${h.id}`,
          author: h.user || 'Pixabay',
          thumbnail: h.previewURL || h.webformatURL,
          url: h.largeImageURL || h.webformatURL,
          width: h.imageWidth || 1280,
          height: h.imageHeight || 720,
          source: 'Pixabay'
        };
      }).filter((it) => Boolean(it.url));
      return res.json({ success: true, items, source: 'Pixabay' });
    }

    if (type === 'audio') {
      const resp = await fetch(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&page_size=20`, {
        headers: { 'User-Agent': 'StudioCut/1.0' }
      });
      const json = await resp.json();
      const items = (json.results || []).map((r) => ({
        id: `ov_a_${r.id}`,
        title: r.title || 'Áudio sem título',
        author: r.creator || 'Openverse / Jamendo',
        duration: r.duration ? Math.round(r.duration / 1000) : 0,
        thumbnail: r.thumbnail || '',
        url: r.url,
        source: r.source || 'Openverse'
      })).filter((it) => Boolean(it.url));
      return res.json({ success: true, items, source: 'Openverse' });
    }

    if (type === 'image') {
      const resp = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20`, {
        headers: { 'User-Agent': 'StudioCut/1.0' }
      });
      const json = await resp.json();
      const items = (json.results || []).map((r) => ({
        id: `ov_i_${r.id}`,
        title: r.title || 'Imagem sem título',
        author: r.creator || 'Openverse',
        thumbnail: r.thumbnail || r.url,
        url: r.url,
        width: r.width || 0,
        height: r.height || 0,
        source: r.source || 'Openverse'
      })).filter((it) => Boolean(it.url));
      return res.json({ success: true, items, source: 'Openverse' });
    }

    // Video search without API key via Wikimedia Commons (preferring browser-playable mp4/webm)
    const wmUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + ' filetype:video')}&gsrlimit=20&prop=videoinfo&viprop=url|mime|size|duration|thumburl&iiurlwidth=320&format=json&origin=*`;
    const resp = await fetch(wmUrl, {
      headers: { 'User-Agent': 'StudioCut/1.0 (local video editor)' }
    });
    const json = await resp.json();
    const pages = Object.values(json?.query?.pages || {});
    const items = pages.map((p) => {
      const vi = p.videoinfo?.[0];
      if (!vi || !vi.url) return null;
      const lowerUrl = vi.url.toLowerCase();
      const mime = String(vi.mime || '').toLowerCase();
      if (!lowerUrl.endsWith('.webm') && !lowerUrl.endsWith('.mp4') && !mime.includes('webm') && !mime.includes('mp4')) {
        return null;
      }
      return {
        id: `wm_v_${p.pageid}`,
        title: String(p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
        author: 'Wikimedia Commons',
        duration: vi.duration ? Math.round(vi.duration) : 0,
        thumbnail: vi.thumburl || '',
        url: vi.url,
        source: 'Wikimedia Commons'
      };
    }).filter(Boolean);

    return res.json({ success: true, items, source: 'Wikimedia Commons' });
  } catch (err) {
    console.error('[Stock Search] Erro:', err);
    res.status(500).json({ error: 'Falha ao buscar mídias online: ' + err.message });
  }
});

// Proxy thumbnails/previews to avoid external hotlink/CORS blocks in browser
app.get('/api/stock/proxy', async (req, res) => {
  const targetUrl = String(req.query.url || '').trim();
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).end();
  }
  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'StudioCut/1.0 (local video editor)' }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).end();
  }
});

app.post('/api/stock/import', async (req, res) => {
  const { url, title = 'midia_online', type = 'video' } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL da mídia é obrigatória.' });
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'StudioCut/1.0' }
    });
    if (!resp.ok) {
      return res.status(400).json({ error: `Falha ao baixar mídia online (HTTP ${resp.status}).` });
    }

    const contentType = resp.headers.get('content-type') || '';
    let ext = path.extname(new URL(url).pathname).toLowerCase();
    if (!ext || ext.length > 6) {
      if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = '.mp3';
      else if (contentType.includes('ogg')) ext = '.ogg';
      else if (contentType.includes('wav')) ext = '.wav';
      else if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('webp')) ext = '.webp';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
      else if (contentType.includes('webm')) ext = '.webm';
      else ext = type === 'audio' ? '.mp3' : type === 'image' ? '.jpg' : '.mp4';
    }

    const safeBase = String(title)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 36) || 'stock_media';

    let filename = `${safeBase}_${Date.now()}${ext}`;
    let filePath = path.join(UPLOADS_DIR, filename);

    const arrayBuffer = await resp.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    const fileHash = await computeFileHash(filePath);
    const mediaIndex = loadMediaIndex();
    const cached = mediaIndex[fileHash];
    if (cached && cached.path && fs.existsSync(cached.path)) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
      return res.json({
        ...cached,
        success: true,
        reused: true,
        originalName: title || cached.originalName
      });
    }

    let info = await probeMedia(filePath);
    let finalType = type;
    if (['.mp3', '.wav', '.aac', '.m4a', '.ogg'].includes(ext) || (!info.hasVideo && info.hasAudio)) {
      finalType = 'audio';
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && (!info.hasVideo || info.duration <= 0.05 || info.fps <= 1)) {
      finalType = 'image';
    } else {
      finalType = 'video';
    }

    const isBrowserCompatible = info.codec === 'h264' &&
      ['yuv420p', 'yuvj420p'].includes(info.pixFmt) &&
      ext === '.mp4' &&
      (!info.hasAudio || ['aac', 'mp3'].includes(info.audioCodec));

    if (finalType === 'video' && !isBrowserCompatible) {
      const webFilename = `web_${path.basename(filename, ext)}.mp4`;
      const webPath = path.join(UPLOADS_DIR, webFilename);
      try {
        await transcodeToWebCompatible(filePath, webPath, null, info.duration || 0);
        if (fs.existsSync(webPath) && fs.statSync(webPath).size > 1000) {
          if (filePath !== webPath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          filePath = webPath;
          filename = webFilename;
          info = await probeMedia(webPath);
        }
      } catch (transcodeErr) {
        console.error('[Stock Import] Erro ao transcodificar vídeo online:', transcodeErr);
      }
    }

    const resultPayload = {
      success: true,
      reused: false,
      filename,
      originalName: `${safeBase}${path.extname(filename)}`,
      path: filePath,
      url: `/media/${encodeURIComponent(filename)}`,
      type: finalType,
      size: fs.statSync(filePath).size,
      info
    };

    mediaIndex[fileHash] = resultPayload;
    saveMediaIndex(mediaIndex);
    res.json(resultPayload);
  } catch (err) {
    console.error('[Stock Import] Erro:', err);
    res.status(500).json({ error: 'Erro ao importar mídia online: ' + err.message });
  }
});

// ============================================================
// PROJECTS & AUTO-SAVE ENDPOINTS
// ============================================================
const AUTOSAVE_FILE = path.join(PROJECTS_DIR, '_autosave_temp.json');

function sanitizeProjectId(raw) {
  return String(raw || 'projeto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `projeto_${Date.now()}`;
}

// Auto-save routes MUST be defined before /api/projects/:id
app.get('/api/projects/autosave', (req, res) => {
  try {
    if (!fs.existsSync(AUTOSAVE_FILE)) {
      return res.json({ exists: false });
    }
    const raw = fs.readFileSync(AUTOSAVE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ exists: true, ...parsed });
  } catch (err) {
    console.error('Erro ao ler autosave:', err);
    res.status(500).json({ error: 'Falha ao ler rascunho automático.' });
  }
});

app.post('/api/projects/autosave', (req, res) => {
  try {
    const { projectId = null, projectName = 'Sem título', data } = req.body || {};
    if (!data) {
      return res.status(400).json({ error: 'Dados do projeto ausentes.' });
    }
    const payload = {
      projectId,
      projectName,
      updatedAt: new Date().toISOString(),
      data
    };
    fs.writeFileSync(AUTOSAVE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, updatedAt: payload.updatedAt });
  } catch (err) {
    console.error('Erro ao salvar autosave:', err);
    res.status(500).json({ error: 'Falha ao salvar rascunho automático.' });
  }
});

app.delete('/api/projects/autosave', (req, res) => {
  try {
    if (fs.existsSync(AUTOSAVE_FILE)) {
      fs.unlinkSync(AUTOSAVE_FILE);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao limpar autosave:', err);
    res.status(500).json({ error: 'Falha ao limpar rascunho.' });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json({ projects: [] });
    }
    const files = fs.readdirSync(PROJECTS_DIR).filter(
      (f) => f.endsWith('.json') && f !== '_autosave_temp.json'
    );
    const projects = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
        const parsed = JSON.parse(raw);
        const data = parsed.data || {};
        projects.push({
          id: parsed.id || file.replace(/\.json$/, ''),
          name: parsed.name || file.replace(/\.json$/, ''),
          updatedAt: parsed.updatedAt || fs.statSync(path.join(PROJECTS_DIR, file)).mtime.toISOString(),
          duration: Number(data.duration) || 0,
          clipCount: Array.isArray(data.clips) ? data.clips.length : 0,
          targetAspect: data.targetAspect || '9:16'
        });
      } catch (e) {
        // Ignore corrupted file
      }
    }
    projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ projects });
  } catch (err) {
    console.error('Erro ao listar projetos:', err);
    res.status(500).json({ error: 'Falha ao listar projetos.' });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { id, name, data } = req.body || {};
    const cleanName = String(name || '').trim() || 'Projeto sem título';
    const safeId = id ? sanitizeProjectId(id) : sanitizeProjectId(cleanName);
    if (!data) {
      return res.status(400).json({ error: 'Dados do projeto ausentes.' });
    }
    const payload = {
      id: safeId,
      name: cleanName,
      updatedAt: new Date().toISOString(),
      data
    };
    const filePath = path.join(PROJECTS_DIR, `${safeId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, id: safeId, name: cleanName, updatedAt: payload.updatedAt });
  } catch (err) {
    console.error('Erro ao salvar projeto:', err);
    res.status(500).json({ error: 'Falha ao salvar projeto.' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const safeId = sanitizeProjectId(req.params.id);
    const filePath = path.join(PROJECTS_DIR, `${safeId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Erro ao abrir projeto:', err);
    res.status(500).json({ error: 'Falha ao abrir projeto.' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const safeId = sanitizeProjectId(req.params.id);
    const filePath = path.join(PROJECTS_DIR, `${safeId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir projeto:', err);
    res.status(500).json({ error: 'Falha ao excluir projeto.' });
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
