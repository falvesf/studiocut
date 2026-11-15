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
  backgroundLayer = null,
  audioClips = [],
  audioTrack = null,
  audioVolume = 1.0
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const containerRef = useRef(null);
  const prevClipIdRef = useRef(null);
  const bgAudioRef = useRef(null);
  const prevAudioClipIdRef = useRef(null);
  const lastAudioSeekTimeRef = useRef(0);
  const pendingAudioSyncRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioGainRef = useRef(null);

  // Auto-detect aspect ratio from video dimensions
  const isVideoVertical = videoInfo?.height > videoInfo?.width;
  const effectiveAspect = targetAspect === 'auto'
    ? (isVideoVertical ? '9:16' : '16:9')
    : targetAspect;

  // Find active main video clip, background clip, and logo overlay clips at current project time
  const visibleTracks = tracks.filter(t => t.visible !== false);
  const reversedVisible = [...visibleTracks].reverse();

  let activeClipAtTime = null;
  for (const t of reversedVisible) {
    const c = clips.find(clip => {
      if ((clip.trackId || 'track_1') !== t.id) return false;
      if (clip.layerRole === 'background' || clip.layerRole === 'logo') return false;
      const s = clip.timelineStart !== undefined ? clip.timelineStart : clip.start;
      const dur = (clip.end - clip.start) / (clip.speed || 1.0);
      return currentTime >= s && currentTime < (s + dur);
    });
    if (c) {
      activeClipAtTime = c;
      break;
    }
  }

  const mainClipsFallback = clips.filter(c => c.layerRole !== 'background' && c.layerRole !== 'logo');
  const activeClip = activeClipAtTime || mainClipsFallback[0] || clips[0];

  const isClipActiveAtNow = (clip) => {
    const s = clip.timelineStart !== undefined ? clip.timelineStart : (clip.start || 0);
    const dur = (clip.end - clip.start) / (clip.speed || 1.0);
    return currentTime >= s && currentTime < (s + dur);
  };

  const visibleTrackIds = new Set(visibleTracks.map(t => t.id));
  const activeBgClip = clips.find(c =>
    c.layerRole === 'background' &&
    visibleTrackIds.has(c.trackId || 'track_1') &&
    isClipActiveAtNow(c)
  ) || null;

  const activeLogoClips = clips.filter(c =>
    c.layerRole === 'logo' &&
    visibleTrackIds.has(c.trackId || 'track_1') &&
    isClipActiveAtNow(c)
  );

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

    // Imperatively enforce mute/volume (React's muted prop only sets defaultMuted)
    // When clip has embedded audio, per-clip fadeIn/fadeOut controls its audio volume.
    const clipMuted = muteOriginal || activeClipTrack?.muted === true || activeClip?.muted === true || activeClip?.audioExtracted === true;
    const vFadeIn = activeClip?.fadeIn || 0;
    const vFadeOut = activeClip?.fadeOut || 0;
    const elapsedClip = Math.max(0, currentTime - s);
    const remainingClip = Math.max(0, dur - elapsedClip);
    let vFadeFactor = 1.0;
    if (!clipMuted) {
      if (vFadeIn > 0 && elapsedClip < vFadeIn) {
        vFadeFactor *= Math.max(0, elapsedClip / vFadeIn);
      }
      if (vFadeOut > 0 && remainingClip < vFadeOut) {
        vFadeFactor *= Math.max(0, remainingClip / vFadeOut);
      }
    }
    const baseClipVol = activeClip?.volume !== undefined ? activeClip.volume : 1.0;
    videoRef.current.muted = clipMuted;
    videoRef.current.volume = clipMuted
      ? 0
      : Math.min(1, Math.max(0, baseClipVol * vFadeFactor));

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
  }, [currentTime, isPlaying, activeClip?.id, activeClip?.videoUrl, activeClip?.muted, activeClip?.audioExtracted, activeClip?.volume, activeClip?.fadeIn, activeClip?.fadeOut, muteOriginal]);

  // Synchronize Independent Audio Track (audioClips / audioTrack) with Playback, Speed & Fades
  useEffect(() => {
    const audioEl = bgAudioRef.current;
    if (!audioEl) return;

    const effectiveAudioList = audioClips.length > 0
      ? audioClips
      : (audioTrack?.url ? [{
          id: 'legacy_audio_track',
          url: audioTrack.url,
          start: 0,
          end: audioTrack.duration || duration || 10,
          timelineStart: audioTrack.timelineStart || 0,
          speed: 1.0,
          volume: audioVolume,
          fadeIn: 0,
          fadeOut: 0,
          muted: false
        }] : []);

    const activeAudio = effectiveAudioList.find((ac) => {
      if (!ac?.url || ac.muted) return false;
      const aStart = ac.timelineStart ?? 0;
      const aDur = Math.max(0.05, (ac.end - ac.start) / (ac.speed || 1.0));
      return currentTime >= aStart - 0.02 && currentTime <= aStart + aDur;
    });

    if (!activeAudio) {
      if (!audioEl.paused) audioEl.pause();
      prevAudioClipIdRef.current = null;
      return;
    }

    if (audioEl.dataset.srcUrl !== activeAudio.url) {
      audioEl.dataset.srcUrl = activeAudio.url;
      audioEl.src = activeAudio.url;
      audioEl.load();
    }

    const speed = activeAudio.speed || 1.0;
    audioEl.preservesPitch = true;
    if (Math.abs(audioEl.playbackRate - speed) > 0.01) {
      audioEl.playbackRate = speed;
    }

    const aStart = activeAudio.timelineStart ?? 0;
    const aDur = Math.max(0.05, (activeAudio.end - activeAudio.start) / speed);
    const elapsedInClip = Math.max(0, currentTime - aStart);
    const targetSrcTime = activeAudio.start + elapsedInClip * speed;
    const drift = Math.abs(audioEl.currentTime - targetSrcTime);
    const isNewAudio = prevAudioClipIdRef.current !== activeAudio.id;
    prevAudioClipIdRef.current = activeAudio.id;
    pendingAudioSyncRef.current = { targetSrcTime, speed };

    const nowMs = Date.now();
    const shouldSeek = isNewAudio || !isPlaying || (drift > 0.45 && nowMs - lastAudioSeekTimeRef.current > 450);
    if (audioEl.readyState >= 1 && !audioEl.seeking && shouldSeek) {
      try {
        audioEl.currentTime = targetSrcTime;
        lastAudioSeekTimeRef.current = nowMs;
      } catch (e) {}
    }

    // Dynamic volume (supports 0%..200% via Web Audio GainNode) with Fade In & Fade Out
    let vol = activeAudio.volume !== undefined ? activeAudio.volume : audioVolume;
    const fIn = activeAudio.fadeIn || 0;
    const fOut = activeAudio.fadeOut || 0;
    if (fIn > 0 && elapsedInClip < fIn) {
      vol *= Math.max(0, elapsedInClip / fIn);
    }
    const remainingInClip = Math.max(0, aDur - elapsedInClip);
    if (fOut > 0 && remainingInClip < fOut) {
      vol *= Math.max(0, remainingInClip / fOut);
    }
    const clampedGain = Math.min(2, Math.max(0, vol));

    if (audioGainRef.current) {
      audioGainRef.current.gain.value = clampedGain;
      audioEl.volume = 1;
    } else {
      audioEl.volume = Math.min(1, clampedGain);
    }

    if (isPlaying && audioEl.paused) {
      if (!audioCtxRef.current) {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          const source = ctx.createMediaElementSource(audioEl);
          const gain = ctx.createGain();
          gain.gain.value = clampedGain;
          source.connect(gain);
          gain.connect(ctx.destination);
          audioCtxRef.current = ctx;
          audioGainRef.current = gain;
          audioEl.volume = 1;
        } catch (e) {}
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      audioEl.play().catch(() => {});
    } else if (!isPlaying && !audioEl.paused) {
      audioEl.pause();
    }
  }, [currentTime, isPlaying, audioClips, audioTrack, audioVolume, duration]);

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!videoRef?.current) return;

    if (isPlaying) {
      setIsPlaying(false);
      videoRef.current.pause();
      if (bgAudioRef.current) bgAudioRef.current.pause();
    } else {
      if (currentTime >= duration - 0.1 && duration > 0) {
        setCurrentTime(0);
      }
      setIsPlaying(true);
      videoRef.current.play().catch(() => {});
      if (bgAudioRef.current && bgAudioRef.current.src) {
        bgAudioRef.current.play().catch(() => {});
      }
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
  const isCurrentTrackMuted = muteOriginal || activeClipTrack?.muted === true || (activeClip?.muted === true && !activeClip?.audioExtracted);

  const activeEnhancement = activeClip?.enhancement || enhancement || 'none';
  const isCasActive = activeEnhancement === 'cas_rtx' || activeEnhancement === 'sharpen';
  const isTurboActive = activeEnhancement === 'whatsapp_turbo';
  const isSuperActive = activeEnhancement === 'super_1080p';

  // Live Transition Preview Calculation (runs smoothly during playback & scrubbing)
  let trOpacity = 1;
  let trTranslateX = 0;
  let trTranslateY = 0;
  let trScale = 1;
  let trClipPath = undefined;
  let trFlashColor = null;
  let trFlashOpacity = 0;
  let trBlur = 0;
  let trIsActive = false;

  if (activeClip && clips.length > 1) {
    const orderedClips = [...clips]
      .filter(c => c.end > c.start)
      .sort((a, b) => (a.timelineStart ?? a.start ?? 0) - (b.timelineStart ?? b.start ?? 0));
    const idxInOrdered = orderedClips.findIndex(c => c.id === activeClip.id);
    if (idxInOrdered >= 0) {
      const aStart = activeClip.timelineStart !== undefined ? activeClip.timelineStart : activeClip.start;
      const aDur = (activeClip.end - activeClip.start) / (activeClip.speed || 1.0);
      const aEnd = aStart + aDur;
      const prevC = idxInOrdered > 0 ? orderedClips[idxInOrdered - 1] : null;
      const nextC = idxInOrdered < orderedClips.length - 1 ? orderedClips[idxInOrdered + 1] : null;

      let phase = null; // 'out' | 'in'
      let trType = 'none';
      let p = 0; // 0 -> 1

      if (activeClip.transitionToNext && activeClip.transitionToNext !== 'none' && nextC) {
        const nDur = (nextC.end - nextC.start) / (nextC.speed || 1.0);
        const trDur = Math.min(Number(activeClip.transitionDuration) || 0.5, Math.max(0.2, Math.min(aDur, nDur) * 0.8));
        const half = trDur / 2;
        if (currentTime >= aEnd - half && currentTime <= aEnd + 0.05) {
          phase = 'out';
          trType = activeClip.transitionToNext;
          p = Math.min(1, Math.max(0, (currentTime - (aEnd - half)) / half));
        }
      }

      if (!phase && prevC && prevC.transitionToNext && prevC.transitionToNext !== 'none') {
        const pDur = (prevC.end - prevC.start) / (prevC.speed || 1.0);
        const trDur = Math.min(Number(prevC.transitionDuration) || 0.5, Math.max(0.2, Math.min(pDur, aDur) * 0.8));
        const half = trDur / 2;
        if (currentTime >= aStart && currentTime <= aStart + half) {
          phase = 'in';
          trType = prevC.transitionToNext;
          p = Math.min(1, Math.max(0, (currentTime - aStart) / half));
        }
      }

      if (phase && trType !== 'none') {
        trIsActive = true;
        const amtOut = p;         // 0 -> 1
        const amtIn = 1 - p;      // 1 -> 0
        const amt = phase === 'out' ? amtOut : amtIn;

        if (trType === 'fade' || trType === 'dissolve') {
          trOpacity = 1 - amt;
        } else if (trType === 'fadeblack') {
          trFlashColor = '#000000';
          trFlashOpacity = amt;
        } else if (trType === 'fadewhite') {
          trFlashColor = '#ffffff';
          trFlashOpacity = amt;
        } else if (trType === 'slideleft' || trType === 'smoothleft') {
          trTranslateX = phase === 'out' ? -amtOut * 100 : amtIn * 100;
          if (trType === 'smoothleft') trOpacity = 1 - amt * 0.6;
        } else if (trType === 'slideright' || trType === 'smoothright') {
          trTranslateX = phase === 'out' ? amtOut * 100 : -amtIn * 100;
          if (trType === 'smoothright') trOpacity = 1 - amt * 0.6;
        } else if (trType === 'slideup') {
          trTranslateY = phase === 'out' ? -amtOut * 100 : amtIn * 100;
        } else if (trType === 'slidedown') {
          trTranslateY = phase === 'out' ? amtOut * 100 : -amtIn * 100;
        } else if (trType === 'wipeleft') {
          trClipPath = phase === 'out' ? `inset(0 ${amtOut * 100}% 0 0)` : `inset(0 0 0 ${amtIn * 100}%)`;
        } else if (trType === 'wiperight') {
          trClipPath = phase === 'out' ? `inset(0 0 0 ${amtOut * 100}%)` : `inset(0 ${amtIn * 100}% 0 0)`;
        } else if (trType === 'wipeup') {
          trClipPath = phase === 'out' ? `inset(0 0 ${amtOut * 100}% 0)` : `inset(${amtIn * 100}% 0 0 0)`;
        } else if (trType === 'wipedown') {
          trClipPath = phase === 'out' ? `inset(${amtOut * 100}% 0 0 0)` : `inset(0 0 ${amtIn * 100}% 0)`;
        } else if (trType === 'horzopen') {
          const pct = amt * 50;
          trClipPath = `inset(0 ${pct}% 0 ${pct}%)`;
        } else if (trType === 'vertopen') {
          const pct = amt * 50;
          trClipPath = `inset(${pct}% 0 ${pct}% 0)`;
        } else if (trType === 'circleopen' || trType === 'circleclose' || trType === 'radial') {
          const radius = (1 - amt) * 75;
          trClipPath = `circle(${radius}% at 50% 50%)`;
        } else if (trType === 'zoomin') {
          trScale = phase === 'out' ? 1 + amtOut * 0.45 : 1 + amtIn * 0.45;
          trOpacity = 1 - amt * 0.7;
        } else if (trType === 'pixelize') {
          trBlur = amt * 8;
          trOpacity = 1 - amt * 0.5;
        } else if (trType === 'diagtl') {
          const diag = (1 - amt) * 200;
          trClipPath = `polygon(0 0, ${diag}% 0, 0 ${diag}%)`;
        }
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col bg-[#090b10] overflow-hidden p-3 select-none"
    >
      {/* Hidden Independent Audio Track Player */}
      <audio
        ref={bgAudioRef}
        className="hidden"
        preload="auto"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const pending = pendingAudioSyncRef.current;
          if (pending) {
            el.preservesPitch = true;
            el.playbackRate = pending.speed || 1.0;
            try {
              el.currentTime = pending.targetSrcTime || 0;
              lastAudioSeekTimeRef.current = Date.now();
            } catch (err) {}
          }
        }}
      />

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
          {/* Layer 1: Background Layer (Timeline Fundo clip OR legacy backgroundLayer) */}
          {(activeBgClip?.videoUrl || backgroundLayer?.url) && (
            <div className="absolute inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
              {(activeBgClip ? activeBgClip.clipType === 'video' : backgroundLayer?.type === 'video') ? (
                <video
                  src={activeBgClip?.videoUrl || backgroundLayer.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={activeBgClip?.videoUrl || backgroundLayer.url}
                  alt="Fundo"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}

          {videoUrl ? (
            <>
              {/* Main Video element with per-clip transform, live transition preview and enhancement */}
              <video
                ref={videoRef}
                src={activeClip?.videoUrl || videoUrl}
                style={{
                  transform: `scale(${scaleRatio * trScale}) translate(${transX + trTranslateX}%, ${transY + trTranslateY}%)`,
                  opacity: (() => {
                    const isExtractedOrMuted = muteOriginal || activeClipTrack?.muted === true || activeClip?.muted === true || activeClip?.audioExtracted === true;
                    if (!activeClip || !isExtractedOrMuted) return trOpacity;
                    const cStart = activeClip.timelineStart !== undefined ? activeClip.timelineStart : activeClip.start;
                    const cDur = Math.max(0.05, (activeClip.end - activeClip.start) / (activeClip.speed || 1.0));
                    const cElapsed = Math.max(0, currentTime - cStart);
                    const cRem = Math.max(0, cDur - cElapsed);
                    let fadeOp = 1.0;
                    if (activeClip.fadeIn > 0 && cElapsed < activeClip.fadeIn) {
                      fadeOp *= Math.max(0, cElapsed / activeClip.fadeIn);
                    }
                    if (activeClip.fadeOut > 0 && cRem < activeClip.fadeOut) {
                      fadeOp *= Math.max(0, cRem / activeClip.fadeOut);
                    }
                    return trOpacity * fadeOp;
                  })(),
                  clipPath: trClipPath,
                  transition: trIsActive ? 'none' : 'transform 0.05s ease-out',
                  display: isCurrentTrackVisible ? 'block' : 'none',
                  imageRendering: (isCasActive || isTurboActive || isSuperActive) ? '-webkit-optimize-contrast' : undefined,
                  filter: [
                    isCasActive
                      ? 'url(#video-cas-sharp) contrast(1.10) saturate(1.08)'
                      : isTurboActive
                      ? 'url(#video-turbo-sharp) contrast(1.08) saturate(1.10)'
                      : isSuperActive
                      ? 'contrast(1.06) saturate(1.06)'
                      : '',
                    trBlur > 0 ? `blur(${trBlur.toFixed(1)}px)` : ''
                  ].filter(Boolean).join(' ') || undefined
                }}
                className="w-full h-full object-contain relative z-10 cursor-pointer"
                muted={isCurrentTrackMuted}
                playsInline
                onClick={togglePlay}
              />

              {/* Live Transition Flash / Fade Overlay */}
              {trFlashColor && trFlashOpacity > 0.01 && (
                <div
                  className="absolute inset-0 z-15 pointer-events-none"
                  style={{ backgroundColor: trFlashColor, opacity: trFlashOpacity }}
                />
              )}

              {/* If current track is hidden, show overlay placeholder */}
              {!isCurrentTrackVisible && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-slate-400 z-10 pointer-events-none text-xs">
                  <EyeOff className="w-6 h-6 mb-1 text-slate-500" />
                  <span>Camada Oculta</span>
                </div>
              )}

              {/* Logo / Image Overlay Live Preview (Timeline Logo clips OR legacy logoOverlay) */}
              {activeLogoClips.length > 0 ? (
                activeLogoClips.map((lc) => {
                  let lcPos = 'top-4 right-4';
                  if (lc.position === 'top-left') lcPos = 'top-4 left-4';
                  else if (lc.position === 'bottom-right') lcPos = 'bottom-6 right-4';
                  else if (lc.position === 'bottom-left') lcPos = 'bottom-6 left-4';
                  else if (lc.position === 'center') lcPos = 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
                  return (
                    <div
                      key={lc.id}
                      className={`absolute ${lcPos} pointer-events-none z-20`}
                      style={{
                        width: `${lc.scale || 15}%`,
                        opacity: (lc.opacity ?? 100) / 100
                      }}
                    >
                      <img
                        src={lc.videoUrl}
                        alt={lc.videoName || 'Logo'}
                        className="w-full h-auto object-contain drop-shadow-md"
                      />
                    </div>
                  );
                })
              ) : logoOverlay?.enabled && logoOverlay?.url ? (
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
              ) : null}

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
