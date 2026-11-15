import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Check,
  ChevronDown,
  Monitor,
  Eye,
  EyeOff,
  Layers
} from 'lucide-react';

export default function Player({
  videoUrl,
  currentTime,
  setCurrentTime,
  duration,
  subtitles = [],
  subtitleStyle = {},
  muteOriginal = false,
  enhancement = 'none',
  targetAspect = 'auto',
  setTargetAspect = () => {},
  videoInfo = null,
  videoRef,
  clips = [],
  tracks = [{ id: 'track_1', name: 'Faixa 1', visible: true, muted: false, locked: false }],
  logoOverlay = null,
  backgroundLayer = null
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const containerRef = useRef(null);
  const prevClipIdRef = useRef(null);

  // Auto-detect aspect ratio from video dimensions
  const isVideoVertical = videoInfo?.height > videoInfo?.width;
  const effectiveAspect = targetAspect === 'auto'
    ? (isVideoVertical ? '9:16' : '16:9')
    : targetAspect;

  // Find active clip at current project time: top visible track wins
  const visibleTracks = tracks.filter(t => t.visible !== false);
  const reversedVisible = [...visibleTracks].reverse();

  let activeClipAtTime = null;
  for (const t of reversedVisible) {
    const c = clips.find(clip => {
      if ((clip.trackId || 'track_1') !== t.id) return false;
      const s = clip.timelineStart !== undefined ? clip.timelineStart : clip.start;
      const dur = (clip.end - clip.start) / (clip.speed || 1.0);
      return currentTime >= s && currentTime < (s + dur);
    });
    if (c) {
      activeClipAtTime = c;
      break;
    }
  }

  const activeClip = activeClipAtTime || clips[0];

  // Active subtitle
  const activeSub = subtitles.find(
    s => currentTime >= s.start && currentTime <= s.end
  );

  // MASTER TIMELINE PLAYBACK ENGINE (Prevents any loop/stutter at clip junctions!)
  useEffect(() => {
    if (!isPlaying) return;

    let animId;
    let lastTime = performance.now();

    const loop = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setCurrentTime(prev => {
        const nextTime = prev + dt;
        if (nextTime >= duration && duration > 0) {
          setIsPlaying(false);
          if (videoRef?.current) videoRef.current.pause();
          return duration;
        }
        return nextTime;
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, duration]);

  // Sync video element's source and playback position with current project time
  useEffect(() => {
    if (!videoRef?.current || !activeClip) return;

    // Change source if different video
    if (activeClip.videoUrl && !videoRef.current.src.endsWith(activeClip.videoUrl)) {
      videoRef.current.src = activeClip.videoUrl;
    }

    // Set playback rate
    videoRef.current.playbackRate = activeClip.speed || 1.0;

    // Calculate source time for this active clip
    const s = activeClip.timelineStart !== undefined ? activeClip.timelineStart : activeClip.start;
    const dur = (activeClip.end - activeClip.start) / (activeClip.speed || 1.0);
    const inRange = currentTime >= s && currentTime <= (s + dur);

    const isNewClip = prevClipIdRef.current !== activeClip.id;
    prevClipIdRef.current = activeClip.id;

    if (inRange) {
      const targetSourceTime = activeClip.start + (currentTime - s) * (activeClip.speed || 1.0);
      const drift = Math.abs(videoRef.current.currentTime - targetSourceTime);

      // Keep in sync (instant snap on clip transition, when paused, or if audio/video drifts > 0.25s)
      if (isNewClip || !isPlaying || drift > 0.25) {
        videoRef.current.currentTime = targetSourceTime;
      }

      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    } else {
      // In gap between clips
      if (isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [currentTime, isPlaying, activeClip?.id, activeClip?.videoUrl]);

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!videoRef?.current) return;

    if (isPlaying) {
      setIsPlaying(false);
      videoRef.current.pause();
    } else {
      if (currentTime >= duration - 0.1 && duration > 0) {
        setCurrentTime(0);
      }
      setIsPlaying(true);
      videoRef.current.play().catch(() => {});
    }
  };

  const skipTime = (delta) => {
    const newT = Math.max(0, Math.min(duration, currentTime + delta));
    setCurrentTime(newT);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00.0';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-2);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipTime(2);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, clips, currentTime]);

  const scaleRatio = (activeClip?.scale || 100) / 100;
  const transX = activeClip?.posX || 0;
  const transY = activeClip?.posY || 0;

  // Aspect box style with aspect-ratio CSS property
  let aspectStyle = { aspectRatio: '16/9' };
  if (effectiveAspect === '9:16') {
    aspectStyle = { aspectRatio: '9/16' };
  } else if (effectiveAspect === '1:1') {
    aspectStyle = { aspectRatio: '1/1' };
  } else if (effectiveAspect === '4:5') {
    aspectStyle = { aspectRatio: '4/5' };
  }

  // Logo position calculation
  let logoPosClass = 'top-4 right-4';
  if (logoOverlay?.position === 'top-left') logoPosClass = 'top-4 left-4';
  else if (logoOverlay?.position === 'bottom-right') logoPosClass = 'bottom-6 right-4';
  else if (logoOverlay?.position === 'bottom-left') logoPosClass = 'bottom-6 left-4';
  else if (logoOverlay?.position === 'center') logoPosClass = 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';

  const aspectOptions = [
    { id: 'auto', label: `Original (${isVideoVertical ? '9:16 Retrato' : '16:9'})` },
    { id: '9:16', label: '9:16 (Reels / TikTok / Shorts / Status)' },
    { id: '16:9', label: '16:9 (YouTube / TV / Horizontal)' },
    { id: '1:1', label: '1:1 (Instagram Quadrado)' },
    { id: '4:5', label: '4:5 (Instagram Feed Retrato)' }
  ];

  // Active track for current active clip
  const activeClipTrack = tracks.find(t => t.id === (activeClip?.trackId || 'track_1')) || tracks[0];
  const isCurrentTrackVisible = activeClipTrack?.visible !== false;
  const isCurrentTrackMuted = muteOriginal || activeClipTrack?.muted === true || activeClip?.muted === true;

  const activeEnhancement = activeClip?.enhancement || enhancement || 'none';
  const isCasActive = activeEnhancement === 'cas_rtx' || activeEnhancement === 'sharpen';
  const isTurboActive = activeEnhancement === 'whatsapp_turbo';
  const isSuperActive = activeEnhancement === 'super_1080p';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col bg-[#090b10] overflow-hidden p-3 select-none"
    >
      {/* Real-time Hardware Video Sharpening Convolution Filters */}
      <svg className="absolute w-0 h-0 pointer-events-none opacity-0" aria-hidden="true">
        <defs>
          {/* CAS (Contrast Adaptive Sharpening) 3x3 High-Pass Kernel */}
          <filter id="video-cas-sharp">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix="0 -0.85 0  -0.85 4.4 -0.85  0 -0.85 0"
            />
          </filter>
          {/* Turbo 3x3 Smoothing + Sharpening Kernel */}
          <filter id="video-turbo-sharp">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix="-0.15 -0.65 -0.15  -0.65 4.2 -0.65  -0.15 -0.65 -0.15"
            />
          </filter>
        </defs>
      </svg>
      {/* Top Player Bar: Aspect Ratio Selector, Track status, Fullscreen */}
      <div className="w-full flex items-center justify-between pb-2 px-1 text-xs shrink-0 z-30">
        <div className="flex items-center gap-2">
          {/* Aspect Ratio (Proporção) Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAspectMenuOpen(!aspectMenuOpen);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151928] hover:bg-[#1e2338] text-slate-200 text-xs font-bold border border-indigo-500/30 hover:border-indigo-400 shadow transition cursor-pointer"
              title="Clique para alternar a proporção da tela (9:16, 16:9, etc.)"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>Proporção: <strong className="text-cyan-300">{effectiveAspect}</strong></span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Dropdown Menu Modal with Backdrop */}
            {aspectMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAspectMenuOpen(false);
                  }}
                />
                <div
                  className="absolute top-10 left-0 w-64 bg-[#141726] border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 text-xs flex flex-col gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2.5 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                    Escolher Proporção do Vídeo
                  </div>
                  {aspectOptions.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setTargetAspect(opt.id);
                        setAspectMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition flex items-center justify-between cursor-pointer ${
                        targetAspect === opt.id
                          ? 'bg-indigo-600 text-white font-bold shadow'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {targetAspect === opt.id && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Active Track Badge */}
          {activeClipTrack && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>{activeClipTrack.name || 'Faixa 1'}</span>
              {!isCurrentTrackVisible && (
                <span className="text-rose-400 flex items-center gap-0.5 text-[10px] font-bold">
                  <EyeOff className="w-3 h-3" /> (Oculta)
                </span>
              )}
              {isCurrentTrackMuted && (
                <span className="text-amber-400 flex items-center gap-0.5 text-[10px] font-bold">
                  <VolumeX className="w-3 h-3" /> (Mudo)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Tela cheia"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Viewport */}
      <div className="flex-1 w-full min-h-0 flex items-center justify-center overflow-hidden relative">
        <div
          style={aspectStyle}
          className="max-h-full max-w-full h-auto w-auto relative flex items-center justify-center rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-black"
        >
          {/* Layer 1: Background Layer (Fundo / Camada Inferior) */}
          {backgroundLayer?.url && (
            <div className="absolute inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
              {backgroundLayer.type === 'video' ? (
                <video
                  src={backgroundLayer.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={backgroundLayer.url}
                  alt="Fundo"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}

          {videoUrl ? (
            <>
              {/* Main Video element with per-clip transform and enhancement */}
              <video
                ref={videoRef}
                src={activeClip?.videoUrl || videoUrl}
                style={{
                  transform: `scale(${scaleRatio}) translate(${transX}%, ${transY}%)`,
                  transition: 'transform 0.05s ease-out',
                  display: isCurrentTrackVisible ? 'block' : 'none',
                  imageRendering: (isCasActive || isTurboActive || isSuperActive) ? '-webkit-optimize-contrast' : undefined,
                  filter: isCasActive
                    ? 'url(#video-cas-sharp) contrast(1.10) saturate(1.08)'
                    : isTurboActive
                    ? 'url(#video-turbo-sharp) contrast(1.08) saturate(1.10)'
                    : isSuperActive
                    ? 'contrast(1.06) saturate(1.06)'
                    : undefined
                }}
                className="w-full h-full object-contain relative z-10 cursor-pointer"
                muted={isCurrentTrackMuted}
                playsInline
                onClick={togglePlay}
              />

              {/* If current track is hidden, show overlay placeholder */}
              {!isCurrentTrackVisible && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-slate-400 z-10 pointer-events-none text-xs">
                  <EyeOff className="w-6 h-6 mb-1 text-slate-500" />
                  <span>Camada Oculta</span>
                </div>
              )}

              {/* Logo / Image Overlay Live Preview (Layer 3 - Top) */}
              {logoOverlay?.enabled && logoOverlay?.url && (
                <div
                  className={`absolute ${logoPosClass} pointer-events-none z-20`}
                  style={{
                    width: `${logoOverlay.scale || 15}%`,
                    opacity: (logoOverlay.opacity || 100) / 100
                  }}
                >
                  <img
                    src={logoOverlay.url}
                    alt="Logo"
                    className="w-full h-auto object-contain drop-shadow-md"
                  />
                </div>
              )}

              {/* Subtitle Overlay Live Preview */}
              {activeSub && (
                <div className="absolute inset-x-4 bottom-8 flex justify-center pointer-events-none z-30">
                  <div
                    className="text-center font-extrabold uppercase px-3 py-1 rounded"
                    style={{
                      color: subtitleStyle.color || '#FACC15',
                      fontSize: `${subtitleStyle.fontSize || 22}px`,
                      textShadow: '0 0 4px #000, 0 0 8px #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
                      letterSpacing: '0.04em',
                      lineHeight: '1.2'
                    }}
                  >
                    {activeSub.text}
                  </div>
                </div>
              )}

              {/* Badges Overlay */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-20">
                {(activeClip?.enhancement && activeClip.enhancement !== 'none') || (enhancement !== 'none') ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/90 backdrop-blur-md border border-indigo-500/50 text-[10px] font-bold text-indigo-200 shadow-lg">
                    <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                    <span>
                      {activeEnhancement === 'cas_rtx' || activeEnhancement === 'sharpen'
                        ? '⚡ Super Nitidez RTX (CAS)'
                        : activeEnhancement === 'whatsapp_turbo'
                        ? 'WhatsApp Turbo HD'
                        : activeEnhancement === 'super_1080p'
                        ? 'Upscale Full HD'
                        : 'Melhoria Ativa'}
                    </span>
                  </div>
                ) : null}

                {activeClip?.speed && activeClip.speed !== 1.0 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-[10px] font-bold text-amber-300">
                    <span>{activeClip.speed}x</span>
                  </div>
                )}

                {activeClip?.scale && activeClip.scale !== 100 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/90 backdrop-blur-md border border-cyan-500/50 text-[10px] font-bold text-cyan-300">
                    <span>Escala: {activeClip.scale}%</span>
                  </div>
                )}

                {(activeClip?.fadeIn > 0 || activeClip?.fadeOut > 0) && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/90 backdrop-blur-md border border-purple-500/50 text-[10px] font-bold text-purple-300">
                    <span>Fade: In {activeClip.fadeIn || 0}s | Out {activeClip.fadeOut || 0}s</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-3">
                <Play className="w-7 h-7 text-slate-600 ml-1" />
              </div>
              <p className="text-sm font-semibold text-slate-400">Nenhum vídeo carregado</p>
              <p className="text-xs text-slate-600 mt-1 max-w-[280px]">
                Importe um vídeo no topo ou selecione no Banco de Mídias para começar.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Controls Bar */}
      {videoUrl && (
        <div className="w-full max-w-2xl mx-auto mt-2 px-4 py-2 rounded-xl bg-[#141724]/95 backdrop-blur-md border border-slate-800 flex items-center justify-between shadow-lg shrink-0 z-30">
          {/* Left: Timecode */}
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span className="font-semibold text-indigo-400">{formatTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTime(duration)}</span>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => skipTime(-5)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Voltar 5 segundos (Seta Esquerda)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 transition cursor-pointer"
              title="Play / Pause (Espaço)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => skipTime(5)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Avançar 5 segundos (Seta Direita)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Quick Mute / Status */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (videoRef?.current) {
                  videoRef.current.muted = !videoRef.current.muted;
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title={isCurrentTrackMuted ? 'Desmutar' : 'Mutar'}
            >
              {isCurrentTrackMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-slate-300" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
