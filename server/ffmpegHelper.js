import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const FFMPEG_BIN = 'C:\\Users\\falve\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe';
const FFPROBE_BIN = 'C:\\Users\\falve\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffprobe.exe';

export function getFFmpegPath() {
  const candidates = [
    FFMPEG_BIN,
    path.join(process.cwd(), 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg.exe'),
    'ffmpeg'
  ];
  for (const c of candidates) {
    if (c === 'ffmpeg' || (fs.existsSync(c) && fs.statSync(c).size > 1000)) {
      return c;
    }
  }
  return 'ffmpeg';
}

export function getFFprobePath() {
  const candidates = [
    FFPROBE_BIN,
    path.join(process.cwd(), 'bin', 'ffprobe.exe'),
    path.join(process.cwd(), 'ffprobe.exe'),
    'ffprobe'
  ];
  for (const c of candidates) {
    if (c === 'ffprobe' || (fs.existsSync(c) && fs.statSync(c).size > 1000)) {
      return c;
    }
  }
  return 'ffprobe';
}

let cachedHwInfo = null;

// Dynamic Hardware & GPU Detection (NVIDIA NVENC, Intel QSV, AMD AMF, CPU Fallback)
export async function detectHardwareCapabilities() {
  if (cachedHwInfo) return cachedHwInfo;

  const ffmpegBin = getFFmpegPath();

  let gpuNames = [];
  try {
    const { execSync } = await import('child_process');
    const stdout = execSync('powershell.exe -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', {
      timeout: 4000,
      encoding: 'utf-8'
    });
    gpuNames = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) {
    console.warn('[HW Probe] Fallback detecção:', e.message);
  }

  const testEncoder = (encName) => {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegBin, [
        '-f', 'lavfi', '-i', 'nullsrc=s=256x256:r=1',
        '-c:v', encName,
        '-t', '0.1',
        '-f', 'null', '-'
      ]);
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  };

  let bestEncoder = 'libx264';
  let encoderType = 'cpu';
  let encoderLabel = 'CPU Multi-Core';

  // 1. Test NVIDIA NVENC (RTX 4070, 3050, GTX 1660/1060, etc.)
  const hasNvenc = await testEncoder('h264_nvenc');
  if (hasNvenc) {
    bestEncoder = 'h264_nvenc';
    encoderType = 'nvenc';
    encoderLabel = 'NVIDIA NVENC';
  } else {
    // 2. Test Intel QuickSync (Intel Core i3/i5/i7/i9 Iris Xe & UHD)
    const hasQsv = await testEncoder('h264_qsv');
    if (hasQsv) {
      bestEncoder = 'h264_qsv';
      encoderType = 'qsv';
      encoderLabel = 'Intel QuickSync';
    } else {
      // 3. Test AMD AMF (Radeon RX / Vega / Ryzen APU)
      const hasAmf = await testEncoder('h264_amf');
      if (hasAmf) {
        bestEncoder = 'h264_amf';
        encoderType = 'amf';
        encoderLabel = 'AMD AMF';
      }
    }
  }

  // Determine user-friendly GPU name
  let displayGpu = '';
  if (encoderType === 'nvenc') {
    displayGpu = gpuNames.find(n => /nvidia|geforce|rtx|gtx/i.test(n)) || 'NVIDIA GeForce GPU';
  } else if (encoderType === 'qsv') {
    displayGpu = gpuNames.find(n => /intel|iris|uhd/i.test(n)) || 'Intel HD/Iris Graphics';
  } else if (encoderType === 'amf') {
    displayGpu = gpuNames.find(n => /amd|radeon/i.test(n)) || 'AMD Radeon GPU';
  } else {
    displayGpu = gpuNames[0] || 'Processador Universal (CPU)';
  }

  cachedHwInfo = {
    gpuName: displayGpu,
    allGpus: gpuNames,
    encoder: bestEncoder,
    encoderType,
    encoderLabel,
    isHardwareAccelerated: encoderType !== 'cpu'
  };

  console.log(`[Hardware Auto-Detect] ✅ GPU: "${displayGpu}" | Codificador: ${bestEncoder} (${encoderLabel})`);
  return cachedHwInfo;
}

export function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(getFFprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,pix_fmt,width,height,r_frame_rate,duration,channels',
      '-of', 'json',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', data => { stdout += data.toString(); });
    ffprobe.stderr.on('data', data => { stderr += data.toString(); });

    ffprobe.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed (${code}): ${stderr}`));
      }
      try {
        const data = JSON.parse(stdout);
        const videoStream = data.streams?.find(s => s.codec_type === 'video');
        const audioStream = data.streams?.find(s => s.codec_type === 'audio');

        let fps = 30;
        if (videoStream?.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2 && parseFloat(parts[1]) > 0) {
            fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
          }
        }

        const duration = parseFloat(data.format?.duration || videoStream?.duration || audioStream?.duration || 0);

        resolve({
          duration,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps,
          codec: videoStream?.codec_name || '',
          pixFmt: videoStream?.pix_fmt || '',
          formatName: data.format?.format_name || '',
          hasVideo: !!videoStream,
          hasAudio: !!audioStream,
          audioCodec: audioStream?.codec_name || '',
          audioChannels: audioStream?.channels || 0,
          sizeBytes: parseInt(data.format?.size || 0, 10),
          bitrate: parseInt(data.format?.bit_rate || 0, 10),
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Parse FFmpeg stderr time=HH:MM:SS.xx into seconds
function parseFfmpegTimeSeconds(chunk) {
  const match = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3]);
}

// Ensure video/audio is 100% browser-playable (H.264/AAC MP4) via hardware acceleration with CPU fallback
export async function transcodeToWebCompatible(inputPath, outputPath, onProgress = null, totalDuration = 0) {
  const hw = await detectHardwareCapabilities();

  return new Promise((resolve, reject) => {
    console.log(`[Transcode] Convertendo mídia com codificador ${hw.encoderLabel}: ${inputPath}`);

    const emitProgress = (chunk, encoderLabel) => {
      if (!onProgress || !totalDuration || totalDuration <= 0) return;
      const sec = parseFfmpegTimeSeconds(chunk);
      if (sec !== null) {
        const percent = Math.min(99, Math.max(1, Math.round((sec / totalDuration) * 100)));
        onProgress({ percent, encoderLabel });
      }
    };

    const runHardware = () => {
      const args = [
        '-y',
        '-i', inputPath
      ];

      if (hw.encoderType === 'nvenc') {
        args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22', '-pix_fmt', 'yuv420p');
      } else if (hw.encoderType === 'qsv') {
        args.push('-c:v', 'h264_qsv', '-global_quality', '22', '-preset', 'medium', '-pix_fmt', 'nv12');
      } else if (hw.encoderType === 'amf') {
        args.push('-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '22', '-pix_fmt', 'yuv420p');
      } else {
        return runCpuFallback();
      }

      args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath);

      if (onProgress) onProgress({ percent: 1, encoderLabel: hw.encoderLabel });
      const proc = spawn(getFFmpegPath(), args);
      let stderr = '';
      proc.stderr.on('data', d => {
        const text = d.toString();
        stderr += text;
        emitProgress(text, hw.encoderLabel);
      });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          console.log(`[Transcode] Concluído com sucesso (${hw.encoderLabel}): ${outputPath}`);
          resolve({ success: true, path: outputPath, encoderLabel: hw.encoderLabel });
        } else {
          console.warn(`[Transcode] ${hw.encoderLabel} falhou com código ${code}, tentando fallback CPU...`);
          runCpuFallback();
        }
      });
      proc.on('error', () => runCpuFallback());
    };

    const runCpuFallback = () => {
      const args = [
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ];

      if (onProgress) onProgress({ percent: 1, encoderLabel: 'CPU (x264)' });
      const proc = spawn(getFFmpegPath(), args);
      let stderr = '';
      proc.stderr.on('data', d => {
        const text = d.toString();
        stderr += text;
        emitProgress(text, 'CPU (x264)');
      });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath)) {
          console.log(`[Transcode CPU] Concluído com sucesso: ${outputPath}`);
          resolve({ success: true, path: outputPath, encoderLabel: 'CPU (x264)' });
        } else {
          reject(new Error(`Falha ao converter vídeo para web: ${stderr}`));
        }
      });
      proc.on('error', reject);
    };

    runHardware();
  });
}

// Extract Audio track from video (optionally trimmed to a specific clip interval) into standalone MP3
export function extractAudio(inputVideo, outputAudio, startTime = null, endTime = null) {
  return new Promise((resolve, reject) => {
    const args = ['-y'];
    if (startTime !== null && startTime !== undefined && Number(startTime) > 0) {
      args.push('-ss', String(Number(startTime).toFixed(3)));
    }
    args.push('-i', inputVideo);
    if (startTime !== null && endTime !== null && Number(endTime) > Number(startTime)) {
      args.push('-t', String((Number(endTime) - Number(startTime)).toFixed(3)));
    }
    args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputAudio);

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderr = '';
    ffmpeg.stderr.on('data', d => { stderr += d.toString(); });
    ffmpeg.on('close', code => {
      if (code === 0 && fs.existsSync(outputAudio) && fs.statSync(outputAudio).size > 256) {
        resolve({ success: true, outputAudio });
      } else {
        reject(new Error(`Este trecho não possui trilha de áudio válida para extrair.`));
      }
    });
    ffmpeg.on('error', reject);
  });
}

export function parseSrt(srtContent) {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let timeLine = lines[1];
    let textStartIndex = 2;

    if (!timeLine.includes('-->') && lines[0].includes('-->')) {
      timeLine = lines[0];
      textStartIndex = 1;
    }

    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!timeMatch) continue;

    const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
    const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
    const text = lines.slice(textStartIndex).join(' ').trim();

    if (text) {
      subtitles.push({
        id: subtitles.length + 1,
        start,
        end,
        text
      });
    }
  }

  return subtitles;
}

export function transcribeWhisper(filePath, modelPath, language = 'pt') {
  return new Promise((resolve, reject) => {
    const tempSrt = path.join(path.dirname(filePath), `whisper_${Date.now()}.srt`);
    const formattedModel = modelPath.replace(/\\/g, '/');
    const formattedDest = tempSrt.replace(/\\/g, '/');

    const filterArg = `whisper=model=${formattedModel}:language=${language}:format=srt:destination=${formattedDest}`;

    const ffmpeg = spawn(getFFmpegPath(), [
      '-y',
      '-i', filePath,
      '-af', filterArg,
      '-f', 'null',
      '-'
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', data => { stderr += data.toString(); });

    ffmpeg.on('close', code => {
      if (fs.existsSync(tempSrt)) {
        try {
          const content = fs.readFileSync(tempSrt, 'utf-8');
          fs.unlinkSync(tempSrt);
          const parsed = parseSrt(content);
          return resolve(parsed);
        } catch (e) {
          return reject(e);
        }
      }

      if (code !== 0) {
        return reject(new Error(`Transcrição falhou (${code}): ${stderr}`));
      }
      resolve([]);
    });
  });
}

export function detectSilences(filePath, noiseDb = -30, minDuration = 0.5) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFFmpegPath(), [
      '-i', filePath,
      '-af', `silencedetect=n=${noiseDb}dB:d=${minDuration}`,
      '-f', 'null',
      '-'
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', data => { stderr += data.toString(); });

    ffmpeg.on('close', () => {
      const silences = [];
      const regexStart = /silence_start: ([\d.]+)/g;
      const regexEnd = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g;

      const starts = [];
      let match;
      while ((match = regexStart.exec(stderr)) !== null) {
        starts.push(parseFloat(match[1]));
      }

      let i = 0;
      while ((match = regexEnd.exec(stderr)) !== null && i < starts.length) {
        const end = parseFloat(match[1]);
        const dur = parseFloat(match[2]);
        silences.push({
          start: starts[i],
          end,
          duration: dur
        });
        i++;
      }

      resolve(silences);
    });
  });
}

export function generateSrtContent(subtitles) {
  return subtitles.map((sub, index) => {
    const formatTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${index + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text.trim()}\n`;
  }).join('\n');
}

export function generateAssContent(subtitles, style = {}) {
  const primaryColor = style.primaryColor || '&H0000FFFF';
  const outlineColor = style.outlineColor || '&H00000000';
  const fontSize = style.fontSize || 22;
  const bold = style.bold ? -1 : 0;
  const outline = style.outlineWidth || 3;
  const shadow = style.shadow || 1;

  const formatAssTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CapCutStyle,Montserrat,${fontSize * 2.2},${primaryColor},&H000000FF,${outlineColor},&H80000000,${bold},0,0,0,100,100,0,0,1,${outline * 2},${shadow * 2},2,50,50,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles.map(sub => {
    const cleanText = sub.text.replace(/\r?\n/g, '\\N');
    return `Dialogue: 0,${formatAssTime(sub.start)},${formatAssTime(sub.end)},CapCutStyle,,0,0,0,,${cleanText}`;
  }).join('\n');

  return header + events;
}

function buildAtempoFilter(speed) {
  if (!speed || speed === 1.0) return '';
  let s = speed;
  const filters = [];
  while (s > 2.0) {
    filters.push('atempo=2.0');
    s /= 2.0;
  }
  while (s < 0.5) {
    filters.push('atempo=0.5');
    s /= 0.5;
  }
  filters.push(`atempo=${s.toFixed(3)}`);
  return filters.join(',');
}

export function executeRender({
  inputVideo,
  outputVideo,
  clips = null,
  tracks = [],
  trim = null,
  targetAspect = 'original', // 'original' | '9:16' | '16:9' | '1:1' | '4:5'
  backgroundLayer = null, // { path, type }
  logoOverlay = null, // { path, position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center', scale: 15, opacity: 100 }
  muteOriginal = false,
  originalVolume = 1.0,
  audioFadeIn = 0,
  audioFadeOut = 0,
  audioTrack = null,
  audioTracks = [],
  audioClips = [],
  audioVolume = 1.0,
  audioLoop = false,
  enhancement = 'none',
  verticalAspect = false,
  transitions = { fadeIn: 0, fadeOut: 0 },
  subtitles = [],
  subtitleStyle = {},
  resolution = 'original',
  totalDuration = 0,
  useNvenc = true,
  onProgress = () => {}
}) {
  return new Promise(async (resolve, reject) => {
    const hw = await detectHardwareCapabilities();
    const args = ['-y'];

    const hiddenTrackIds = new Set((tracks || []).filter(t => t.visible === false).map(t => t.id));
    const mutedTrackIds = new Set((tracks || []).filter(t => t.muted === true).map(t => t.id));

    let allTimelineClips = [];
    if (clips && clips.length > 0) {
      allTimelineClips = clips
        .filter(c => c.end > c.start && !hiddenTrackIds.has(c.trackId))
        .sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));
    } else if (trim) {
      allTimelineClips = [{ start: trim.start || 0, end: trim.end || totalDuration, transitionToNext: 'none', videoPath: inputVideo }];
    } else {
      allTimelineClips = [{ start: 0, end: totalDuration, transitionToNext: 'none', videoPath: inputVideo }];
    }

    const bgTimelineClips = allTimelineClips.filter(c => c.layerRole === 'background' && c.videoPath && fs.existsSync(c.videoPath));
    const logoTimelineClips = allTimelineClips.filter(c => c.layerRole === 'logo' && c.videoPath && fs.existsSync(c.videoPath));
    const activeClips = allTimelineClips.filter(c => c.layerRole !== 'background' && c.layerRole !== 'logo');

    // Collect all unique video inputs
    const uniqueVideos = [];
    activeClips.forEach(c => {
      const v = c.videoPath || inputVideo;
      if (!uniqueVideos.includes(v)) uniqueVideos.push(v);
    });

    // Add video inputs
    uniqueVideos.forEach(v => {
      args.push('-i', v);
    });

    const videoInputMap = {};
    uniqueVideos.forEach((v, idx) => {
      videoInputMap[v] = idx;
    });

    let nextInputIdx = uniqueVideos.length;

    // Active independent audio clips (excluding muted clips and muted audio tracks)
    const mutedAudioTrackIds = new Set((audioTracks || []).filter(t => t.muted === true).map(t => t.id));
    const activeAudioClips = (audioClips || []).filter(
      ac => !ac.muted && !mutedAudioTrackIds.has(ac.audioTrackId) && ac.path && fs.existsSync(ac.path)
    );

    // Legacy audio input index if audioTrack exists and no audioClips
    let audioInputIdx = -1;
    if (audioTrack && fs.existsSync(audioTrack) && activeAudioClips.length === 0) {
      audioInputIdx = nextInputIdx++;
      if (audioLoop) args.push('-stream_loop', '-1');
      args.push('-i', audioTrack);
    }

    const audioClipInputIndices = [];
    activeAudioClips.forEach((ac) => {
      audioClipInputIndices.push(nextInputIdx++);
      args.push('-i', ac.path);
    });

    // Background Layer input index (Layer 1 - Bottom)
    const bgTimelineInputIndices = [];
    bgTimelineClips.forEach((bc) => {
      bgTimelineInputIndices.push(nextInputIdx++);
      if (bc.clipType === 'video') {
        args.push('-stream_loop', '-1');
      } else {
        args.push('-loop', '1');
      }
      args.push('-i', bc.videoPath);
    });

    let bgInputIdx = -1;
    if (bgTimelineClips.length === 0 && backgroundLayer && backgroundLayer.path && fs.existsSync(backgroundLayer.path)) {
      bgInputIdx = nextInputIdx++;
      if (backgroundLayer.type === 'video') {
        args.push('-stream_loop', '-1');
      } else {
        args.push('-loop', '1');
      }
      args.push('-i', backgroundLayer.path);
    }

    // Image/Logo input index (Layer 3 - Top)
    const logoTimelineInputIndices = [];
    logoTimelineClips.forEach((lc) => {
      logoTimelineInputIndices.push(nextInputIdx++);
      args.push('-loop', '1', '-i', lc.videoPath);
    });

    let logoInputIdx = -1;
    if (logoTimelineClips.length === 0 && logoOverlay && logoOverlay.path && fs.existsSync(logoOverlay.path)) {
      logoInputIdx = nextInputIdx++;
      args.push('-i', logoOverlay.path);
    }

    // Effective duration
    const effectiveDuration = activeClips.reduce((acc, c) => {
      const dur = c.end - c.start;
      const spd = c.speed || 1.0;
      return acc + (dur / spd);
    }, 0);

    let tempAssFile = null;
    if (subtitles && subtitles.length > 0) {
      tempAssFile = path.join(path.dirname(outputVideo), `subs_${Date.now()}.ass`);
      fs.writeFileSync(tempAssFile, generateAssContent(subtitles, subtitleStyle), 'utf-8');
    }

    // Dimensions based on targetAspect
    let canvasW = 0;
    let canvasH = 0;
    if (targetAspect === '9:16') {
      canvasW = 1080; canvasH = 1920;
    } else if (targetAspect === '16:9') {
      canvasW = 1920; canvasH = 1080;
    } else if (targetAspect === '1:1') {
      canvasW = 1080; canvasH = 1080;
    } else if (targetAspect === '4:5') {
      canvasW = 1080; canvasH = 1350;
    }

    const filterParts = [];
    const clipLabelsV = [];
    const clipLabelsA = [];

    activeClips.forEach((c, idx) => {
      const vSrc = videoInputMap[c.videoPath || inputVideo] || 0;
      const dur = c.end - c.start;
      const speed = c.speed || 1.0;
      const scaledDur = dur / speed;
      const vLabel = `v${idx}`;
      const aLabel = `a${idx}`;

      let vFilters = `trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS`;
      let aFilters = `atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS`;

      if (speed !== 1.0) {
        vFilters += `,setpts=(1/${speed})*PTS`;
        const aTempoStr = buildAtempoFilter(speed);
        if (aTempoStr) aFilters += `,${aTempoStr}`;
      }

      // Zoom / Scale / Position (Transform) & Target Canvas Placement
      const scaleVal = c.scale || 100;
      const posX = (c.posX || 0) / 100;
      const posY = (c.posY || 0) / 100;
      const factor = scaleVal / 100;

      if (canvasW > 0 && canvasH > 0) {
        // 1. High-fidelity Lanczos scaling: scale base fit multiplied by factor
        vFilters += `,scale=w='if(gt(a,${canvasW}/${canvasH}),max(16,round(${canvasW}*${factor}/2)*2),-2)':h='if(gt(a,${canvasW}/${canvasH}),-2,max(16,round(${canvasH}*${factor}/2)*2))':flags=lanczos`;

        // 2. Crop excess if larger than canvas (offset by posX, posY)
        vFilters += `,crop=min(in_w\\,${canvasW}):min(in_h\\,${canvasH}):max(0\\,min(in_w-${canvasW}\\,(in_w-${canvasW})/2-(${posX}*in_w))):max(0\\,min(in_h-${canvasH}\\,(in_h-${canvasH})/2-(${posY}*in_h)))`;

        // 3. Pad to canvas if smaller than canvas (transparent if bgLayer or bgTimelineClips, else black)
        const hasAnyBg = bgInputIdx !== -1 || bgTimelineClips.length > 0;
        const padColor = hasAnyBg ? 'color=black@0' : 'black';
        const formatStr = hasAnyBg ? ',format=rgba' : '';
        vFilters += `${formatStr},pad=${canvasW}:${canvasH}:(${canvasW}-iw)/2+(${posX}*${canvasW}):(${canvasH}-ih)/2+(${posY}*${canvasH}):${padColor},setsar=1`;
      } else if (scaleVal > 100) {
        vFilters += `,scale=iw*${factor}:ih*${factor}:flags=lanczos,crop=iw/${factor}:ih/${factor}:(iw-iw/${factor})/2+(${posX}*iw):(ih-ih/${factor})/2+(${posY}*ih),setsar=1`;
      } else {
        vFilters += `,setsar=1`;
      }

      // Per-clip enhancement (Hardware RTX & High-Fidelity Filters)
      const clipEnhance = c.enhancement || enhancement;
      if (clipEnhance === 'cas_rtx') {
        // Contrast Adaptive Sharpening (AMD/NVIDIA FidelityFX CAS) - Perfect for zoomed/stretched footage
        vFilters += `,cas=strength=0.8,unsharp=5:5:0.6:5:5:0.0`;
      } else if (clipEnhance === 'whatsapp_turbo') {
        vFilters += `,hqdn3d=2.0:1.5:3.0:2.5,cas=strength=0.7,unsharp=5:5:0.8:5:5:0.0,eq=contrast=1.06:brightness=0.01:saturation=1.06`;
      } else if (clipEnhance === 'sharpen') {
        vFilters += `,cas=strength=0.75,unsharp=5:5:1.1:5:5:0.0`;
      } else if (clipEnhance === 'denoise') {
        vFilters += `,hqdn3d=3.0:2.5:4.0:3.5`;
      } else if (clipEnhance === 'super_1080p') {
        vFilters += `,scale=w='max(1920,in_w)':h=-2:flags=lanczos,cas=strength=0.85,unsharp=5:5:0.7:5:5:0.0`;
      }

      // Transitions & Per-Clip Fades
      // If clip has embedded audio, fade controls audio; if audio was extracted/muted, fade controls video from/to black.
      const clipHasEmbeddedAudio = !muteOriginal && !mutedTrackIds.has(c.trackId) && !c.muted && !c.audioExtracted;
      if (c.fadeIn > 0 && scaledDur > c.fadeIn) {
        if (clipHasEmbeddedAudio) {
          aFilters += `,afade=t=in:st=0:d=${c.fadeIn}`;
        } else {
          vFilters += `,fade=t=in:st=0:d=${c.fadeIn}`;
        }
      }
      if (c.fadeOut > 0 && scaledDur > c.fadeOut) {
        if (clipHasEmbeddedAudio) {
          aFilters += `,afade=t=out:st=${scaledDur - c.fadeOut}:d=${c.fadeOut}`;
        } else {
          vFilters += `,fade=t=out:st=${scaledDur - c.fadeOut}:d=${c.fadeOut}`;
        }
      }

      // Remove legacy fade-out/fade-in inline hacks when using real xfade transitions
      const VALID_XFADES = new Set([
        'fade', 'fadeblack', 'fadewhite', 'dissolve',
        'slideleft', 'slideright', 'slideup', 'slidedown', 'smoothleft', 'smoothright',
        'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'horzopen', 'vertopen',
        'circleopen', 'circleclose', 'zoomin', 'radial', 'pixelize', 'diagtl'
      ]);
      const hasAnyXfade = activeClips.length > 1 && activeClips.slice(0, -1).some(cl => VALID_XFADES.has(cl.transitionToNext));
      if (hasAnyXfade) {
        vFilters += `,settb=AVTB,fps=30`;
      }

      // Per-Clip Audio Volume & Track Mute
      if (mutedTrackIds.has(c.trackId) || c.muted) {
        aFilters += `,volume=0`;
      } else if (c.volume !== undefined && c.volume !== 1.0) {
        aFilters += `,volume=${c.volume}`;
      }

      filterParts.push(`[${vSrc}:v]${vFilters}[${vLabel}]`);
      filterParts.push(`[${vSrc}:a]${aFilters}[${aLabel}]`);
      clipLabelsV.push(`[${vLabel}]`);
      clipLabelsA.push(`[${aLabel}]`);
    });

    const VALID_XFADES_CHAIN = new Set([
      'fade', 'fadeblack', 'fadewhite', 'dissolve',
      'slideleft', 'slideright', 'slideup', 'slidedown', 'smoothleft', 'smoothright',
      'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'horzopen', 'vertopen',
      'circleopen', 'circleclose', 'zoomin', 'radial', 'pixelize', 'diagtl'
    ]);
    const useXfadeChain = activeClips.length > 1 && activeClips.slice(0, -1).some(cl => VALID_XFADES_CHAIN.has(cl.transitionToNext));

    if (useXfadeChain) {
      let curV = clipLabelsV[0].replace(/^\[|\]$/g, '');
      let curA = clipLabelsA[0].replace(/^\[|\]$/g, '');
      let accDur = (activeClips[0].end - activeClips[0].start) / (activeClips[0].speed || 1.0);

      for (let i = 1; i < activeClips.length; i++) {
        const prevClip = activeClips[i - 1];
        const currClip = activeClips[i];
        const prevDur = (prevClip.end - prevClip.start) / (prevClip.speed || 1.0);
        const currDur = (currClip.end - currClip.start) / (currClip.speed || 1.0);
        const vNextIn = clipLabelsV[i].replace(/^\[|\]$/g, '');
        const aNextIn = clipLabelsA[i].replace(/^\[|\]$/g, '');
        const isLast = i === activeClips.length - 1;
        const outV = isLast ? 'basev' : `xv${i}`;
        const outA = isLast ? 'basea' : `xa${i}`;

        const trType = prevClip.transitionToNext;
        if (VALID_XFADES_CHAIN.has(trType) && Math.min(prevDur, currDur) > 0.3) {
          const requestedDur = Number(prevClip.transitionDuration) || 0.5;
          const maxAllowedDur = Math.max(0.2, Math.min(prevDur, currDur) * 0.8);
          const d = Math.min(requestedDur, maxAllowedDur);
          const offset = Math.max(0, accDur - d);
          filterParts.push(`[${curV}][${vNextIn}]xfade=transition=${trType}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[${outV}]`);
          filterParts.push(`[${curA}][${aNextIn}]acrossfade=d=${d.toFixed(3)}:c1=tri:c2=tri[${outA}]`);
          accDur = accDur + currDur - d;
        } else {
          filterParts.push(`[${curV}][${vNextIn}]concat=n=2:v=1:a=0[${outV}]`);
          filterParts.push(`[${curA}][${aNextIn}]concat=n=2:v=0:a=1[${outA}]`);
          accDur = accDur + currDur;
        }
        curV = outV;
        curA = outA;
      }
    } else {
      const concatInputs = clipLabelsV.map((vLbl, idx) => `${vLbl}${clipLabelsA[idx]}`).join('');
      filterParts.push(`${concatInputs}concat=n=${activeClips.length}:v=1:a=1[basev][basea]`);
    }

    // Global video filters
    const postVFilters = [];
    const hasPerClipEnhance = activeClips.some(c => c.enhancement && c.enhancement !== 'none');

    if (!hasPerClipEnhance) {
      if (enhancement === 'whatsapp_turbo') {
        postVFilters.push('hqdn3d=2.0:1.5:3.0:2.5');
        postVFilters.push('unsharp=5:5:1.2:5:5:0.0');
        postVFilters.push('eq=contrast=1.06:brightness=0.02:saturation=1.08');
      } else if (enhancement === 'sharpen') {
        postVFilters.push('unsharp=5:5:1.3:5:5:0.0');
      } else if (enhancement === 'denoise') {
        postVFilters.push('hqdn3d=3.0:2.5:4.0:3.5');
      } else if (enhancement === 'super_1080p') {
        postVFilters.push('scale=1920:1080:flags=lanczos');
        postVFilters.push('unsharp=5:5:0.9:5:5:0.0');
      }
    }

    if (!verticalAspect && targetAspect === 'original') {
      if (resolution === '1080p' && enhancement !== 'super_1080p') {
        postVFilters.push('scale=-2:1080:flags=lanczos');
      } else if (resolution === '720p') {
        postVFilters.push('scale=-2:720:flags=lanczos');
      } else if (resolution === '4k') {
        postVFilters.push('scale=-2:2160:flags=lanczos');
      }
    }

    if (transitions?.fadeIn > 0) {
      postVFilters.push(`fade=t=in:st=0:d=${transitions.fadeIn}`);
    }
    if (transitions?.fadeOut > 0 && effectiveDuration > transitions.fadeOut) {
      postVFilters.push(`fade=t=out:st=${effectiveDuration - transitions.fadeOut}:d=${transitions.fadeOut}`);
    }

    if (tempAssFile) {
      const escapedPath = tempAssFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      postVFilters.push(`ass='${escapedPath}'`);
    }

    let currentVTarget = 'basev';
    if (postVFilters.length > 0) {
      filterParts.push(`[${currentVTarget}]${postVFilters.join(',')}[vfilt]`);
      currentVTarget = 'vfilt';
    }

    if (verticalAspect) {
      filterParts.push(`[${currentVTarget}]split=2[bgsrc][fgsrc]`);
      filterParts.push(`[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg]`);
      filterParts.push(`[fgsrc]scale=1080:1920:force_original_aspect_ratio=decrease[fg]`);
      filterParts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[finalv]`);
      currentVTarget = 'finalv';
    }

    // Background Layer (Timeline Fundo clips OR legacy backgroundLayer)
    if (bgTimelineClips.length > 0) {
      const targetW = canvasW || 1920;
      const targetH = canvasH || 1080;
      filterParts.push(`color=c=black:s=${targetW}x${targetH}:d=${effectiveDuration}[bgBase]`);
      let curBg = 'bgBase';
      bgTimelineClips.forEach((bc, idx) => {
        const inIdx = bgTimelineInputIndices[idx];
        const bStart = Math.max(0, bc.timelineStart || 0);
        const bDur = Math.max(0.1, (bc.end - bc.start) / (bc.speed || 1.0));
        const bEnd = bStart + bDur;
        filterParts.push(`[${inIdx}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}[bgTl${idx}]`);
        filterParts.push(`[${curBg}][bgTl${idx}]overlay=0:0:enable='between(t,${bStart.toFixed(3)},${bEnd.toFixed(3)})':shortest=1[bgMix${idx}]`);
        curBg = `bgMix${idx}`;
      });
      filterParts.push(`[${curBg}][${currentVTarget}]overlay=0:0:shortest=1[vWithBg]`);
      currentVTarget = 'vWithBg';
    } else if (bgInputIdx !== -1) {
      const targetW = canvasW || 1920;
      const targetH = canvasH || 1080;
      filterParts.push(`[${bgInputIdx}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}[bgScaled]`);
      filterParts.push(`[bgScaled][${currentVTarget}]overlay=0:0:shortest=1[vWithBg]`);
      currentVTarget = 'vWithBg';
    }

    // Logo / Image Overlay (Timeline Logo clips OR legacy logoOverlay)
    if (logoTimelineClips.length > 0) {
      logoTimelineClips.forEach((lc, idx) => {
        const inIdx = logoTimelineInputIndices[idx];
        const lStart = Math.max(0, lc.timelineStart || 0);
        const lDur = Math.max(0.1, (lc.end - lc.start) / (lc.speed || 1.0));
        const lEnd = lStart + lDur;
        const scalePct = (lc.scale || 15) / 100;
        const opacityVal = (lc.opacity ?? 100) / 100;
        filterParts.push(`[${inIdx}:v]scale=iw*${scalePct}:-1,format=rgba,colorchannelmixer=aa=${opacityVal}[logoTl${idx}]`);
        let overlayPos = 'W-w-30:30';
        if (lc.position === 'top-left') overlayPos = '30:30';
        else if (lc.position === 'bottom-right') overlayPos = 'W-w-30:H-h-30';
        else if (lc.position === 'bottom-left') overlayPos = '30:H-h-30';
        else if (lc.position === 'center') overlayPos = '(W-w)/2:(H-h)/2';
        filterParts.push(`[${currentVTarget}][logoTl${idx}]overlay=${overlayPos}:enable='between(t,${lStart.toFixed(3)},${lEnd.toFixed(3)})':shortest=1[vWithLogo${idx}]`);
        currentVTarget = `vWithLogo${idx}`;
      });
    } else if (logoInputIdx !== -1) {
      const scalePct = (logoOverlay.scale || 15) / 100;
      const opacityVal = (logoOverlay.opacity || 100) / 100;
      filterParts.push(`[${logoInputIdx}:v]scale=iw*${scalePct}:-1,format=rgba,colorchannelmixer=aa=${opacityVal}[logoScaled]`);

      let overlayPos = 'W-w-30:30';
      if (logoOverlay.position === 'top-left') overlayPos = '30:30';
      else if (logoOverlay.position === 'bottom-right') overlayPos = 'W-w-30:H-h-30';
      else if (logoOverlay.position === 'bottom-left') overlayPos = '30:H-h-30';
      else if (logoOverlay.position === 'center') overlayPos = '(W-w)/2:(H-h)/2';

      filterParts.push(`[${currentVTarget}][logoScaled]overlay=${overlayPos}[vWithLogo]`);
      currentVTarget = 'vWithLogo';
    }

    // Audio Pipeline
    const hasOriginalAudio = !muteOriginal && originalVolume > 0;
    let currentATarget = 'basea';

    const aFiltersList = [];
    if (originalVolume !== 1.0) aFiltersList.push(`volume=${originalVolume}`);
    if (audioFadeIn > 0) aFiltersList.push(`afade=t=in:st=0:d=${audioFadeIn}`);
    if (audioFadeOut > 0 && effectiveDuration > audioFadeOut) {
      aFiltersList.push(`afade=t=out:st=${effectiveDuration - audioFadeOut}:d=${audioFadeOut}`);
    }

    if (aFiltersList.length > 0) {
      filterParts.push(`[${currentATarget}]${aFiltersList.join(',')}[aorig]`);
      currentATarget = 'aorig';
    }

    // Independent Audio Clips Pipeline
    const audioClipLabels = [];
    activeAudioClips.forEach((ac, idx) => {
      const inIdx = audioClipInputIndices[idx];
      const aStart = Math.max(0, ac.start || 0);
      const aEnd = ac.end || ac.duration || 0;
      const aSpeed = Math.max(0.5, Math.min(2.0, ac.speed || 1.0));
      const aVol = ac.volume !== undefined ? ac.volume : 1.0;
      const aDelayMs = Math.max(0, Math.round((ac.timelineStart || 0) * 1000));
      const aDurOut = aEnd > aStart ? (aEnd - aStart) / aSpeed : 0;

      const chain = [
        `atrim=start=${aStart}${aEnd > aStart ? `:end=${aEnd}` : ''}`,
        'asetpts=PTS-STARTPTS'
      ];
      if (Math.abs(aSpeed - 1.0) > 0.01) chain.push(`atempo=${aSpeed}`);
      if (aVol !== 1.0) chain.push(`volume=${aVol}`);
      if (ac.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${ac.fadeIn}`);
      if (ac.fadeOut > 0 && aDurOut > ac.fadeOut) {
        chain.push(`afade=t=out:st=${(aDurOut - ac.fadeOut).toFixed(3)}:d=${ac.fadeOut}`);
      }
      if (aDelayMs > 0) chain.push(`adelay=${aDelayMs}|${aDelayMs}`);

      const lbl = `[aclip${idx}]`;
      filterParts.push(`[${inIdx}:a]${chain.join(',')}${lbl}`);
      audioClipLabels.push(lbl);
    });

    if (audioClipLabels.length > 0) {
      if (hasOriginalAudio) {
        filterParts.push(`[${currentATarget}]${audioClipLabels.join('')}amix=inputs=${1 + audioClipLabels.length}:duration=first:normalize=0[finala]`);
        currentATarget = 'finala';
      } else if (audioClipLabels.length === 1) {
        filterParts.push(`${audioClipLabels[0]}anull[finala]`);
        currentATarget = 'finala';
      } else {
        filterParts.push(`${audioClipLabels.join('')}amix=inputs=${audioClipLabels.length}:duration=longest:normalize=0[finala]`);
        currentATarget = 'finala';
      }
    } else if (audioInputIdx !== -1 && hasOriginalAudio) {
      filterParts.push(`[${audioInputIdx}:a]volume=${audioVolume}[abgm]`);
      filterParts.push(`[${currentATarget}][abgm]amix=inputs=2:duration=first[finala]`);
      currentATarget = 'finala';
    } else if (audioInputIdx !== -1 && !hasOriginalAudio) {
      filterParts.push(`[${audioInputIdx}:a]volume=${audioVolume}[finala]`);
      currentATarget = 'finala';
    }

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', `[${currentVTarget}]`);

    if (hasOriginalAudio || audioInputIdx !== -1 || audioClipLabels.length > 0) {
      args.push('-map', `[${currentATarget}]`);
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }

    if (useNvenc && hw.isHardwareAccelerated) {
      if (hw.encoderType === 'nvenc') {
        args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21', '-b:v', '0');
      } else if (hw.encoderType === 'qsv') {
        args.push('-c:v', 'h264_qsv', '-global_quality', '22', '-preset', 'medium');
      } else if (hw.encoderType === 'amf') {
        args.push('-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '22');
      } else {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '21');
      }
    } else {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
    }

    args.push('-t', String(effectiveDuration));
    args.push('-movflags', '+faststart');
    args.push(outputVideo);

    const ffmpegProc = spawn(getFFmpegPath(), args);

    let stderr = '';
    const timeRegex = /time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/;

    ffmpegProc.stderr.on('data', data => {
      const chunk = data.toString();
      stderr += chunk;

      const match = chunk.match(timeRegex);
      if (match && effectiveDuration > 0) {
        const hours = parseFloat(match[1]);
        const mins = parseFloat(match[2]);
        const secs = parseFloat(match[3]);
        const currentTime = hours * 3600 + mins * 60 + secs;
        const percent = Math.min(99, Math.round((currentTime / effectiveDuration) * 100));
        onProgress({ percent, currentTime, totalDuration: effectiveDuration });
      }
    });

    ffmpegProc.on('close', code => {
      if (tempAssFile && fs.existsSync(tempAssFile)) {
        try { fs.unlinkSync(tempAssFile); } catch {}
      }

      if (code === 0) {
        onProgress({ percent: 100, currentTime: effectiveDuration, totalDuration: effectiveDuration });
        resolve({ success: true, outputPath: outputVideo });
      } else {
        reject(new Error(`Renderização FFmpeg falhou (${code}): ${stderr}`));
      }
    });

    ffmpegProc.on('error', err => {
      if (tempAssFile && fs.existsSync(tempAssFile)) {
        try { fs.unlinkSync(tempAssFile); } catch {}
      }
      reject(err);
    });
  });
}

export function generateQuickPreview({ inputVideo, startTime = 0, enhancement = 'whatsapp_turbo', outputVideo }) {
  return new Promise(async (resolve, reject) => {
    const hw = await detectHardwareCapabilities();
    const args = ['-y', '-ss', String(startTime), '-i', inputVideo, '-t', '3'];

    const filters = [];
    if (enhancement === 'cas_rtx') {
      filters.push('cas=strength=0.85,unsharp=5:5:0.7:5:5:0.0');
    } else if (enhancement === 'whatsapp_turbo') {
      filters.push('hqdn3d=2.0:1.5:3.0:2.5,cas=strength=0.7,unsharp=5:5:0.8:5:5:0.0,eq=contrast=1.06:brightness=0.02:saturation=1.08,scale=1920:1080:flags=lanczos');
    } else if (enhancement === 'super_1080p') {
      filters.push('scale=1920:1080:flags=lanczos,cas=strength=0.8,unsharp=5:5:0.7:5:5:0.0');
    } else if (enhancement === 'sharpen') {
      filters.push('cas=strength=0.75,unsharp=5:5:1.1:5:5:0.0');
    } else if (enhancement === 'denoise') {
      filters.push('hqdn3d=3.0:2.5:4.0:3.5');
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    if (hw.encoderType === 'nvenc') {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p2');
    } else if (hw.encoderType === 'qsv') {
      args.push('-c:v', 'h264_qsv', '-preset', 'veryfast');
    } else if (hw.encoderType === 'amf') {
      args.push('-c:v', 'h264_amf', '-quality', 'speed');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'ultrafast');
    }

    args.push('-c:a', 'aac', '-movflags', '+faststart', outputVideo);

    const proc = spawn(getFFmpegPath(), args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve({ success: true, outputVideo });
      else reject(new Error(`Erro ao gerar prévia (${code}): ${stderr}`));
    });
    proc.on('error', reject);
  });
}
