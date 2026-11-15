import React, { useRef, useState, useEffect } from 'react';
import {
  Scissors,
  Trash2,
  RotateCcw,
  Plus,
  Layers,
  Sparkles,
  ArrowRightLeft,
  Image as ImageIcon,
  Film,
  Music,
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  Move,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { useDialog } from './DialogProvider.jsx';
import { TRANSITIONS_CATALOG } from '../utils/transitionsCatalog.js';
import { extractWaveformPeaks } from '../utils/waveformHelper.js';

function AudioClipWaveform({ url, start = 0, end = 0, duration = 0, volume = 1, fadeIn = 0, fadeOut = 0, speed = 1 }) {
  const [peaks, setPeaks] = useState([]);

  useEffect(() => {
    let active = true;
    if (!url) return;
    extractWaveformPeaks(url, 140).then((p) => {
      if (active && Array.isArray(p)) setPeaks(p);
    });
    return () => { active = false; };
  }, [url]);

  const totalDur = duration > 0 ? duration : Math.max(end, 1);
  const clipSourceDur = Math.max(0.05, (end > 0 ? end : totalDur) - start);
  const clipTimelineDur = clipSourceDur / (speed || 1);

  const startIdx = peaks.length > 0 ? Math.max(0, Math.floor((start / totalDur) * peaks.length)) : 0;
  const endIdx = peaks.length > 0 ? Math.min(peaks.length, Math.max(startIdx + 1, Math.ceil(((end > 0 ? end : totalDur) / totalDur) * peaks.length))) : 0;
  const visiblePeaks = peaks.slice(startIdx, endIdx);

  const volY = Math.max(6, Math.min(94, 100 - (Math.min(2, Math.max(0, volume)) / 2) * 100));
  const fadeInPct = Math.min(50, (fadeIn / Math.max(0.1, clipTimelineDur)) * 100);
  const fadeOutPct = Math.min(50, (fadeOut / Math.max(0.1, clipTimelineDur)) * 100);

  return (
    <svg
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none opacity-85"
    >
      {/* Waveform bars */}
      {visiblePeaks.length > 0 && visiblePeaks.map((amp, i) => {
        const barW = 1000 / visiblePeaks.length;
        const x = i * barW;
        const scaledAmp = Math.min(1, amp * Math.min(1.8, Math.max(0.25, volume)));
        const h = Math.max(6, scaledAmp * 88);
        const y = 100 - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(2, barW * 0.7)}
            height={h}
            rx={1}
            fill="rgba(52, 211, 153, 0.55)"
          />
        );
      })}

      {/* Fade-in shaded triangle */}
      {fadeInPct > 0.5 && (
        <polygon
          points={`0,100 0,0 ${fadeInPct * 10},0`}
          fill="rgba(15, 23, 42, 0.65)"
        />
      )}

      {/* Fade-out shaded triangle */}
      {fadeOutPct > 0.5 && (
        <polygon
          points={`${1000 - fadeOutPct * 10},0 1000,0 1000,100`}
          fill="rgba(15, 23, 42, 0.65)"
        />
      )}

      {/* Volume horizontal indicator line */}
      <line
        x1="0"
        y1={volY}
        x2="1000"
        y2={volY}
        stroke="rgba(251, 191, 36, 0.85)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
    </svg>
  );
}

export default function Timeline({
  duration,
  currentTime,
  setCurrentTime,
  clips,
  setClips,
  selectedClipId,
  setSelectedClipId,
  tracks = [{ id: 'track_1', name: 'Faixa 1', visible: true, muted: false, locked: false }],
  setTracks = () => {},
  subtitles = [],
  silences = [],
  videoRef,
  audioTrack = null,
  setAudioTrack = () => {},
  audioClips = [],
  setAudioClips = () => {},
  selectedAudioClipId = null,
  setSelectedAudioClipId = () => {},
  setActiveTab = () => {},
  undo = () => {},
  redo = () => {},
  canUndo = false,
  canRedo = false,
  pushHistorySnapshot = () => {}
}) {
  const containerRef = useRef(null);
  const { showAlert, showConfirm } = useDialog();
  const trackAreaRef = useRef(null);
  const timelineContentRef = useRef(null);
  const isDraggingScrubber = useRef(false);
  const isDraggingTrim = useRef(null); // { clipId, edge: 'left' | 'right' }

  // CapCut Zoom Level (0.5x to 6.0x, default 1.0x fit)
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Drag & Drop State for moving clips in time and across tracks
  const [dragClipState, setDragClipState] = useState(null); // { clipId, startX, startY, origStart, origTrackId, currentStart, currentTrackId, deltaY, clipDur }
  const [snapGuideTime, setSnapGuideTime] = useState(null);
  const [transitionMenuClipId, setTransitionMenuClipId] = useState(null);

  // Compute layout: ensure each clip has a valid timelineStart
  const clipsWithTimeline = clips.map((c, i) => {
    const clipDur = Math.max(0.1, (c.end - c.start) / (c.speed || 1.0));
    let tStart = c.timelineStart;
    if (tStart === undefined) {
      const priorClipsOnTrack = clips.slice(0, i).filter(prev => (prev.trackId || 'track_1') === (c.trackId || 'track_1'));
      if (priorClipsOnTrack.length > 0) {
        const last = priorClipsOnTrack[priorClipsOnTrack.length - 1];
        const lastDur = (last.end - last.start) / (last.speed || 1.0);
        tStart = (last.timelineStart || 0) + lastDur;
      } else {
        tStart = 0;
      }
    }
    const tEnd = tStart + clipDur;
    return {
      ...c,
      clipDur,
      timelineStart: tStart,
      timelineEnd: tEnd,
      trackId: c.trackId || 'track_1'
    };
  });

  // Organize clips by track
  const tracksClipsMap = {};
  tracks.forEach(t => {
    tracksClipsMap[t.id] = [];
  });
  clipsWithTimeline.forEach(c => {
    if (!tracksClipsMap[c.trackId]) {
      tracksClipsMap[c.trackId] = [];
    }
    tracksClipsMap[c.trackId].push(c);
  });

  // Total project duration
  const maxClipEnd = clipsWithTimeline.length > 0
    ? Math.max(...clipsWithTimeline.map(c => c.timelineEnd))
    : 0;
  // Real project duration (length of all clips combined)
  const projectDuration = maxClipEnd;

  // Base visible horizon for timeline canvas (CapCut default is ~120s / 2 minutes)
  const MIN_TIMELINE_SPAN = 120; // 2 minutes minimum visible track canvas
  const timelineViewDuration = Math.max(
    MIN_TIMELINE_SPAN,
    projectDuration > 0 ? projectDuration * 1.15 : MIN_TIMELINE_SPAN
  );

  const selectedClip = clipsWithTimeline.find(c => c.id === selectedClipId) || null;

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00.0';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  };

  // Ultra-Smooth Scrubbing Engine
  const updateScrubTime = (clientX) => {
    const targetEl = timelineContentRef.current || trackAreaRef.current;
    if (!targetEl || timelineViewDuration <= 0) return;
    const rect = targetEl.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTimelineTime = ratio * timelineViewDuration;

    // Clamp to project duration if clips exist, or allow scrubbing on canvas
    const clampedTime = projectDuration > 0
      ? Math.max(0, Math.min(projectDuration, newTimelineTime))
      : Math.max(0, Math.min(timelineViewDuration, newTimelineTime));

    setCurrentTime(clampedTime);

    // Sync HTML5 video element with active clip under needle
    const active = clipsWithTimeline.find(c => clampedTime >= c.timelineStart && clampedTime <= c.timelineEnd) || clipsWithTimeline[0];
    if (active && videoRef?.current) {
      const localTime = active.start + (clampedTime - active.timelineStart) * (active.speed || 1.0);
      if (active.videoUrl && !videoRef.current.src.endsWith(active.videoUrl)) {
        videoRef.current.src = active.videoUrl;
      }
      videoRef.current.currentTime = Math.max(0, localTime);

      if (active.id !== selectedClipId) {
        setSelectedClipId(active.id);
      }
    }
  };

  // Drag horizontally to reposition an audio clip on the timeline
  const handleAudioClipDragStart = (e, ac) => {
    if (e.button !== 0 || isDraggingTrim.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedClipId(null);
    setSelectedAudioClipId(ac.id);
    setActiveTab('audio');

    const startX = e.clientX;
    const origStart = ac.timelineStart || 0;
    const contentEl = timelineContentRef.current || trackAreaRef.current;
    const rect = contentEl ? contentEl.getBoundingClientRect() : { width: 1000 };
    const pxPerSec = rect.width / timelineViewDuration;
    const snapThresholdSec = 10 / Math.max(1, pxPerSec);

    const snapTargets = [0, currentTime];
    clipsWithTimeline.forEach((c) => {
      snapTargets.push(c.timelineStart, c.timelineEnd);
    });

    const onPointerMove = (moveEvent) => {
      const deltaSec = (moveEvent.clientX - startX) / pxPerSec;
      let nextStart = Math.max(0, origStart + deltaSec);
      let snapped = null;
      for (const target of snapTargets) {
        if (Math.abs(nextStart - target) < snapThresholdSec) {
          nextStart = target;
          snapped = target;
          break;
        }
      }
      setSnapGuideTime(snapped);
      setAudioClips(prev => prev.map(item => item.id === ac.id ? { ...item, timelineStart: nextStart } : item));
    };

    const onPointerUp = () => {
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Trim left/right edges of an audio clip
  const handleAudioTrimStart = (e, ac, edge) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClipId(null);
    setSelectedAudioClipId(ac.id);
    setActiveTab('audio');
    isDraggingTrim.current = { clipId: ac.id, edge };

    const startX = e.clientX;
    const origStart = ac.start || 0;
    const origEnd = ac.end || ac.duration || 10;
    const origTimelineStart = ac.timelineStart || 0;
    const maxDur = ac.duration || origEnd;
    const speed = ac.speed || 1;

    const contentEl = timelineContentRef.current || trackAreaRef.current;
    const rect = contentEl ? contentEl.getBoundingClientRect() : { width: 1000 };
    const pxPerSec = rect.width / timelineViewDuration;

    const onPointerMove = (moveEvent) => {
      const deltaTimelineSec = (moveEvent.clientX - startX) / pxPerSec;
      const deltaSourceSec = deltaTimelineSec * speed;

      if (edge === 'left') {
        const clampedStart = Math.max(0, Math.min(origEnd - 0.2 * speed, origStart + deltaSourceSec));
        const actualDeltaTimeline = (clampedStart - origStart) / speed;
        const nextTimelineStart = Math.max(0, origTimelineStart + actualDeltaTimeline);
        setAudioClips(prev => prev.map(item => item.id === ac.id ? { ...item, start: clampedStart, timelineStart: nextTimelineStart } : item));
      } else {
        const clampedEnd = Math.min(maxDur, Math.max(origStart + 0.2 * speed, origEnd + deltaSourceSec));
        setAudioClips(prev => prev.map(item => item.id === ac.id ? { ...item, end: clampedEnd } : item));
      }
    };

    const onPointerUp = () => {
      isDraggingTrim.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0 || isDraggingTrim.current || dragClipState) return;
    isDraggingScrubber.current = true;
    updateScrubTime(e.clientX);

    const onPointerMove = (moveEvent) => {
      if (isDraggingScrubber.current) {
        updateScrubTime(moveEvent.clientX);
      }
    };

    const onPointerUp = () => {
      isDraggingScrubber.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Drag and Drop Engine for moving clips in time and across tracks (with auto-create new layer on drag up)
  const handleClipDragStart = (e, clip) => {
    if (e.button !== 0 || isDraggingTrim.current) return;
    e.stopPropagation();

    setSelectedAudioClipId(null);
    setSelectedClipId(clip.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.timelineStart || 0;
    const origTrackId = clip.trackId || 'track_1';
    const clipDur = clip.clipDur;

    const contentEl = timelineContentRef.current || trackAreaRef.current;
    const rect = contentEl ? contentEl.getBoundingClientRect() : { width: 1000 };
    const pxPerSec = rect.width / timelineViewDuration;

    setDragClipState({
      clipId: clip.id,
      startX,
      startY,
      origStart,
      origTrackId,
      currentStart: origStart,
      currentTrackId: origTrackId,
      deltaY: 0,
      clipDur
    });

    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const deltaSec = deltaX / pxPerSec;
      let rawStart = Math.max(0, origStart + deltaSec);

      // Detect which track row the cursor is hovering over
      let targetTrackId = origTrackId;
      const trackElements = Array.from(document.querySelectorAll('[data-track-id]'));

      if (trackElements.length > 0) {
        const topTrackRect = trackElements[0].getBoundingClientRect();
        // If cursor Y is above top track by more than 6px
        if (moveEvent.clientY < topTrackRect.top - 2) {
          targetTrackId = '__new_track_above__';
        } else {
          // Check if cursor is still within the original track's height with a 12px margin
          const origEl = trackElements.find(el => el.getAttribute('data-track-id') === origTrackId);
          if (origEl) {
            const origR = origEl.getBoundingClientRect();
            if (moveEvent.clientY >= origR.top - 8 && moveEvent.clientY <= origR.bottom + 8) {
              targetTrackId = origTrackId;
            } else {
              for (const el of trackElements) {
                const r = el.getBoundingClientRect();
                if (moveEvent.clientY >= r.top && moveEvent.clientY <= r.bottom) {
                  targetTrackId = el.getAttribute('data-track-id');
                  break;
                }
              }
            }
          } else {
            for (const el of trackElements) {
              const r = el.getBoundingClientRect();
              if (moveEvent.clientY >= r.top && moveEvent.clientY <= r.bottom) {
                targetTrackId = el.getAttribute('data-track-id');
                break;
              }
            }
          }
        }
      }

      // Snap points: 0s, needle, and ONLY clips on the target track (prevents being sucked into other tracks)
      const snapPoints = [0, currentTime];
      clipsWithTimeline.forEach(other => {
        if (other.id !== clip.id && (other.trackId || 'track_1') === targetTrackId) {
          snapPoints.push(other.timelineStart);
          snapPoints.push(other.timelineEnd);
        }
      });

      // Snap threshold: 12 pixels in seconds
      const snapThresholdSec = 12 / pxPerSec;
      let snapped = rawStart;
      let guide = null;

      // Check snap with other clips on this track
      for (const sp of snapPoints) {
        if (Math.abs(rawStart - sp) <= snapThresholdSec) {
          snapped = sp;
          guide = sp;
          break;
        } else if (Math.abs((rawStart + clipDur) - sp) <= snapThresholdSec) {
          snapped = sp - clipDur;
          guide = sp;
          break;
        }
      }
      setSnapGuideTime(guide);

      setDragClipState({
        clipId: clip.id,
        startX,
        startY,
        origStart,
        origTrackId,
        currentStart: snapped,
        currentTrackId: targetTrackId,
        deltaY,
        clipDur
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setSnapGuideTime(null);

      setDragClipState(latest => {
        if (!latest) return null;

        if (latest.currentTrackId === '__new_track_above__') {
          // CREATE NEW TRACK ABOVE AUTOMATICALLY!
          const newTrackId = `track_${Date.now()}`;
          let updatedTracks;
          setTracks(prev => {
            const newTrack = {
              id: newTrackId,
              name: `Faixa ${prev.length + 1}`,
              visible: true,
              muted: false,
              locked: false
            };
            updatedTracks = [...prev, newTrack];
            return updatedTracks;
          });
          setClips(prev => {
            const updatedClips = prev.map(c => {
              if (c.id === latest.clipId) {
                return {
                  ...c,
                  timelineStart: latest.currentStart,
                  trackId: newTrackId
                };
              }
              return c;
            });
            pushHistorySnapshot(updatedClips, updatedTracks || tracks, latest.clipId);
            return updatedClips;
          });
        } else {
          // Commit position to existing track
          setClips(prev => {
            const updatedClips = prev.map(c => {
              if (c.id === latest.clipId) {
                return {
                  ...c,
                  timelineStart: latest.currentStart,
                  trackId: latest.currentTrackId
                };
              }
              return c;
            });
            pushHistorySnapshot(updatedClips, tracks, latest.clipId);
            return updatedClips;
          });
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Edge Trim Dragging: Left Edge (trim in) / Right Edge (trim out)
  const handleEdgeTrimPointerDown = (e, clip, edge) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const startX = e.clientX;
    const origStart = clip.start;
    const origEnd = clip.end;
    const origTimelineStart = clip.timelineStart || 0;
    const contentEl = timelineContentRef.current || trackAreaRef.current;
    const pxPerSec = (contentEl?.getBoundingClientRect().width || 1000) / timelineViewDuration;

    isDraggingTrim.current = { clipId: clip.id, edge };

    const onPointerMove = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaSec = (deltaPx / pxPerSec) * (clip.speed || 1.0);

      setClips(prev => prev.map(c => {
        if (c.id !== clip.id) return c;

        if (edge === 'left') {
          const newStart = Math.max(0, Math.min(origEnd - 0.2, origStart + deltaSec));
          const actualShift = (newStart - origStart) / (clip.speed || 1.0);
          return {
            ...c,
            start: newStart,
            timelineStart: Math.max(0, origTimelineStart + actualShift)
          };
        } else {
          const newEnd = Math.max(origStart + 0.2, origEnd + deltaSec);
          return { ...c, end: newEnd };
        }
      }));
    };

    const onPointerUp = () => {
      isDraggingTrim.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      pushHistorySnapshot(clips, tracks, clip.id);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Split Clip at current needle (Scissors Action)
  const handleSplit = () => {
    if (projectDuration <= 0 && audioClips.length === 0) return;

    // 0. If an audio clip is selected, split it (or warn if needle is outside it)
    const selAudio = audioClips.find(ac => ac.id === selectedAudioClipId);
    if (selAudio) {
      const aStart = selAudio.timelineStart || 0;
      const aSpeed = selAudio.speed || 1;
      const aDur = ((selAudio.end || selAudio.duration || 10) - (selAudio.start || 0)) / aSpeed;
      if (currentTime > aStart + 0.05 && currentTime < aStart + aDur - 0.05) {
        const splitOffset = (currentTime - aStart) * aSpeed;
        const splitPt = (selAudio.start || 0) + splitOffset;
        const firstPart = { ...selAudio, end: splitPt };
        const secondPart = {
          ...selAudio,
          id: `aclip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          start: splitPt,
          timelineStart: currentTime
        };
        setAudioClips(prev => {
          const idx = prev.findIndex(c => c.id === selAudio.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1, firstPart, secondPart);
          return next;
        });
        setSelectedAudioClipId(secondPart.id);
      } else {
        showAlert('Posicione a agulha amarela dentro do trecho de áudio selecionado para dividir.');
      }
      return;
    }

    if (projectDuration <= 0 || clips.length === 0) return;

    // 1. If user has selected a clip and needle is inside it, split that clip!
    let target = clipsWithTimeline.find(c =>
      c.id === selectedClipId &&
      currentTime > c.timelineStart + 0.05 &&
      currentTime < c.timelineEnd - 0.05
    );

    // 2. Otherwise, find the clip on the highest visible track under the needle
    if (!target) {
      const visibleTracks = tracks.filter(t => t.visible !== false);
      const reversedTracks = [...visibleTracks].reverse();
      for (const tr of reversedTracks) {
        target = clipsWithTimeline.find(c =>
          (c.trackId || 'track_1') === tr.id &&
          currentTime > c.timelineStart + 0.05 &&
          currentTime < c.timelineEnd - 0.05
        );
        if (target) break;
      }
    }

    if (!target) {
      showAlert('Posicione a agulha amarela dentro de um trecho para dividir com a tesoura.');
      return;
    }

    const originalClip = clips.find(c => c.id === target.id);
    if (!originalClip) return;

    const splitOffset = (currentTime - target.timelineStart) * (originalClip.speed || 1.0);
    const splitSourceTime = originalClip.start + splitOffset;

    const firstPart = {
      ...originalClip,
      end: splitSourceTime,
      timelineStart: target.timelineStart,
      transitionToNext: 'none'
    };

    const secondPart = {
      ...originalClip,
      id: `clip_${Date.now()}`,
      start: splitSourceTime,
      timelineStart: currentTime,
      transitionToNext: originalClip.transitionToNext
    };

    const targetIdx = clips.findIndex(c => c.id === originalClip.id);
    const newClips = [...clips];
    newClips.splice(targetIdx, 1, firstPart, secondPart);
    setClips(newClips);
    setSelectedClipId(secondPart.id);
    pushHistorySnapshot(newClips, tracks, secondPart.id);
  };

  // Trim Left: Discard everything to the left of the needle in selected clip
  const handleTrimLeft = () => {
    if (!selectedClip) return;
    const offset = (currentTime - selectedClip.timelineStart) * (selectedClip.speed || 1.0);
    const newStart = selectedClip.start + offset;
    if (newStart >= selectedClip.end - 0.1 || newStart < 0) return;

    const actualShift = offset / (selectedClip.speed || 1.0);
    const updatedClips = clips.map(c => c.id === selectedClip.id ? {
      ...c,
      start: newStart,
      timelineStart: (c.timelineStart || 0) + actualShift
    } : c);
    setClips(updatedClips);
    pushHistorySnapshot(updatedClips, tracks, selectedClip.id);
  };

  // Trim Right: Discard everything to the right of the needle in selected clip
  const handleTrimRight = () => {
    if (!selectedClip) return;
    const offset = (currentTime - selectedClip.timelineStart) * (selectedClip.speed || 1.0);
    const newEnd = selectedClip.start + offset;
    if (newEnd <= selectedClip.start + 0.1) return;

    const updatedClips = clips.map(c => c.id === selectedClip.id ? { ...c, end: newEnd } : c);
    setClips(updatedClips);
    pushHistorySnapshot(updatedClips, tracks, selectedClip.id);
  };

  // Delete selected audio clip with confirmation
  const handleDeleteSelectedAudio = async (audioId) => {
    if (!audioId) return;
    const targetAudio = audioClips.find(ac => ac.id === audioId);
    if (!targetAudio) return;
    const confirmed = await showConfirm(
      `Deseja realmente excluir o trecho de áudio "${targetAudio.name || 'Áudio'}"?`
    );
    if (!confirmed) return;
    setAudioClips(prev => {
      const next = prev.filter(item => item.id !== audioId);
      if (next.length === 0) setAudioTrack(null);
      if (selectedAudioClipId === audioId) setSelectedAudioClipId(next[0]?.id || null);
      return next;
    });
  };

  // Delete active selection (audio clip or video clip) with confirmation
  const handleDeleteActiveSelection = async () => {
    if (selectedAudioClipId) {
      await handleDeleteSelectedAudio(selectedAudioClipId);
      return;
    }
    if (!selectedClipId) return;
    if (clips.length <= 1) {
      showAlert('Você precisa manter pelo menos 1 trecho no projeto.');
      return;
    }
    const targetClip = clips.find(c => c.id === selectedClipId);
    const confirmed = await showConfirm(
      `Deseja realmente excluir o trecho de vídeo "${targetClip?.videoName || 'Trecho'}"?`
    );
    if (!confirmed) return;
    const newClips = clips.filter(c => c.id !== selectedClipId);
    setClips(newClips);
    setSelectedClipId(newClips[0].id);
    pushHistorySnapshot(newClips, tracks, newClips[0].id);
  };

  // Delete selected clip
  const handleDeleteClip = async (idToDelete) => {
    if (selectedAudioClipId && !idToDelete) {
      await handleDeleteSelectedAudio(selectedAudioClipId);
      return;
    }
    if (clips.length <= 1) {
      showAlert('Você precisa manter pelo menos 1 trecho no projeto.');
      return;
    }
    const targetClip = clips.find(c => c.id === idToDelete);
    const confirmed = await showConfirm(
      `Deseja realmente excluir o trecho de vídeo "${targetClip?.videoName || 'Trecho'}"?`
    );
    if (!confirmed) return;
    const newClips = clips.filter(c => c.id !== idToDelete);
    setClips(newClips);
    if (selectedClipId === idToDelete) {
      setSelectedClipId(newClips[0].id);
    }
    pushHistorySnapshot(newClips, tracks, newClips[0].id);
  };

  // Reset to single full clip
  const handleReset = () => {
    if (clips.length > 0) {
      const first = clips[0];
      setClips([{
        ...first,
        start: 0,
        end: duration,
        timelineStart: 0,
        transitionToNext: 'none'
      }]);
      setSelectedClipId(first.id);
    }
  };

  // Toggle Transition for a clip
  const toggleTransition = (clipId, type) => {
    setClips(prev => prev.map(c => c.id === clipId ? { ...c, transitionToNext: type } : c));
    setTransitionMenuClipId(null);
  };

  // Add new track on top
  const handleAddTrackAbove = (targetTrackId) => {
    const newIndex = tracks.length + 1;
    const newTrack = {
      id: `track_${Date.now()}`,
      name: `Faixa ${newIndex}`,
      visible: true,
      muted: false,
      locked: false
    };

    if (targetTrackId) {
      const idx = tracks.findIndex(t => t.id === targetTrackId);
      const updated = [...tracks];
      updated.splice(idx + 1, 0, newTrack);
      setTracks(updated);
    } else {
      setTracks(prev => [...prev, newTrack]);
    }
  };

  // Delete track
  const handleDeleteTrack = async (trackId) => {
    if (tracks.length <= 1) {
      showAlert('O projeto precisa ter pelo menos 1 faixa.');
      return;
    }
    const hasClips = clips.some(c => (c.trackId || 'track_1') === trackId);
    if (hasClips) {
      const confirmed = await showConfirm({
        title: 'Excluir Faixa',
        message: 'Esta faixa contém trechos de vídeo. Deseja realmente excluí-la e remover seus trechos?',
        confirmText: 'Excluir Faixa',
        cancelText: 'Cancelar',
        variant: 'danger'
      });
      if (!confirmed) return;
    }
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setClips(prev => prev.filter(c => (c.trackId || 'track_1') !== trackId));
  };

  // Toggle Track Controls (Lock, Eye, Mute)
  const toggleTrackVisibility = (trackId) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, visible: t.visible === false ? true : false } : t));
  };
  const toggleTrackMute = (trackId) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t));
  };
  const toggleTrackLock = (trackId) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t));
  };

  // Move clip up or down via buttons
  const handleMoveClipUp = (clip) => {
    const currentTrackIdx = tracks.findIndex(t => t.id === (clip.trackId || 'track_1'));
    if (currentTrackIdx === tracks.length - 1) {
      const newTrackId = `track_${Date.now()}`;
      const newTrack = {
        id: newTrackId,
        name: `Faixa ${tracks.length + 1}`,
        visible: true,
        muted: false,
        locked: false
      };
      const updatedTracks = [...tracks, newTrack];
      const updatedClips = clips.map(c => c.id === clip.id ? { ...c, trackId: newTrackId } : c);
      setTracks(updatedTracks);
      setClips(updatedClips);
      pushHistorySnapshot(updatedClips, updatedTracks, clip.id);
    } else {
      const nextTrack = tracks[currentTrackIdx + 1];
      const updatedClips = clips.map(c => c.id === clip.id ? { ...c, trackId: nextTrack.id } : c);
      setClips(updatedClips);
      pushHistorySnapshot(updatedClips, tracks, clip.id);
    }
  };

  const handleMoveClipDown = (clip) => {
    const currentTrackIdx = tracks.findIndex(t => t.id === (clip.trackId || 'track_1'));
    if (currentTrackIdx > 0) {
      const prevTrack = tracks[currentTrackIdx - 1];
      const updatedClips = clips.map(c => c.id === clip.id ? { ...c, trackId: prevTrack.id } : c);
      setClips(updatedClips);
      pushHistorySnapshot(updatedClips, tracks, clip.id);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleSplit();
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        handleTrimLeft();
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleTrimRight();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAudioClipId || (selectedClipId && clips.length > 1)) {
          e.preventDefault();
          handleDeleteActiveSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, clips, selectedClipId, selectedAudioClipId, audioClips, clipsWithTimeline]);

  // Auto-scroll timeline to follow needle during playback when zoomed in
  useEffect(() => {
    if (zoomLevel <= 1.0 || !trackAreaRef.current || !timelineContentRef.current) return;
    const container = trackAreaRef.current;
    const content = timelineContentRef.current;

    const contentWidth = content.clientWidth;
    const containerWidth = container.clientWidth;
    if (contentWidth <= containerWidth) return;

    const needleX = (currentTime / timelineViewDuration) * contentWidth;
    const currentScroll = container.scrollLeft;

    if (needleX > currentScroll + containerWidth * 0.85 || needleX < currentScroll) {
      container.scrollTo({
        left: Math.max(0, needleX - containerWidth * 0.25),
        behavior: 'smooth'
      });
    }
  }, [currentTime, zoomLevel, timelineViewDuration]);

  // Mouse wheel with Ctrl zooming handler
  const handleTimelineWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomLevel(prev => Math.max(0.5, Math.min(6.0, +(prev + zoomDelta).toFixed(2))));
    }
  };

  // Fit to screen handler (like CapCut desktop "Ajustar à tela")
  const handleFitToScreen = () => {
    if (projectDuration <= 0) {
      setZoomLevel(1.0);
      return;
    }
    const targetZoom = +(timelineViewDuration / Math.max(2, projectDuration / 0.8)).toFixed(2);
    // If already fitted, reset to 1.0; otherwise zoom to fit
    if (Math.abs(zoomLevel - targetZoom) < 0.15 && zoomLevel !== 1.0) {
      setZoomLevel(1.0);
    } else {
      setZoomLevel(Math.max(0.5, Math.min(6.0, targetZoom)));
    }
    if (trackAreaRef.current) {
      trackAreaRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const currentPercent = timelineViewDuration > 0 ? (currentTime / timelineViewDuration) * 100 : 0;

  // Intelligent CapCut Ruler Ticks Generator (human-friendly intervals: 10s, 5s, 1s, 0.5s...)
  const visibleDuration = timelineViewDuration / zoomLevel;
  const targetStep = visibleDuration / 12; // Aim for ~12-14 clean markers visible
  const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  let rulerStep = niceSteps[niceSteps.length - 1];
  for (let i = 0; i < niceSteps.length; i++) {
    if (niceSteps[i] >= targetStep) {
      rulerStep = niceSteps[i];
      break;
    }
  }

  const tickTimes = [];
  for (let t = 0; t <= timelineViewDuration + 0.001; t += rulerStep) {
    tickTimes.push(+t.toFixed(2));
  }

  const formatRulerTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (rulerStep < 1) {
      const ms = Math.floor((secs % 1) * 10);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Render tracks from Top (Faixa 2) to Bottom (Faixa 1) like CapCut
  const renderedTracks = [...tracks].reverse();

  return (
    <div
      ref={containerRef}
      className="h-72 border-t border-slate-800 bg-[#0a0c14] flex flex-col justify-between select-none"
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between text-xs px-3 py-1.5 border-b border-slate-800/80 bg-[#0d101a] shrink-0 gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          {/* Undo / Redo in Timeline Toolbar */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-slate-800">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg flex items-center transition ${
                canUndo
                  ? 'text-slate-200 hover:text-white hover:bg-slate-800 cursor-pointer border border-slate-700'
                  : 'text-slate-600 cursor-not-allowed opacity-35 border border-transparent'
              }`}
              title="Desfazer (Ctrl + Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg flex items-center transition ${
                canRedo
                  ? 'text-slate-200 hover:text-white hover:bg-slate-800 cursor-pointer border border-slate-700'
                  : 'text-slate-600 cursor-not-allowed opacity-35 border border-transparent'
              }`}
              title="Refazer (Ctrl + Y ou Ctrl + Shift + Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Big Scissors Button */}
          <button
            type="button"
            onClick={handleSplit}
            disabled={clips.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition shadow-md ${
              clips.length > 0
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40'
            }`}
            title={clips.length > 0 ? "Dividir o vídeo no ponto da agulha (Atalho: S)" : "Importe um vídeo para usar a tesoura"}
          >
            <Scissors className="w-4 h-4 text-cyan-200" />
            <span>Dividir (S)</span>
          </button>

          {/* Quick Trim Buttons */}
          <button
            type="button"
            onClick={handleTrimLeft}
            disabled={clips.length === 0 || !selectedClip}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition border ${
              clips.length > 0 && selectedClip
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 cursor-pointer'
                : 'bg-slate-850 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
            }`}
            title="Cortar início até a agulha (Atalho: Q)"
          >
            <span>« Cortar Início (Q)</span>
          </button>

          <button
            type="button"
            onClick={handleTrimRight}
            disabled={clips.length === 0 || !selectedClip}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition border ${
              clips.length > 0 && selectedClip
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 cursor-pointer'
                : 'bg-slate-850 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
            }`}
            title="Cortar do cursor até o fim (Atalho: W)"
          >
            <span>Cortar Fim » (W)</span>
          </button>

          {/* Move Layer Buttons for selected clip */}
          {selectedClip && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
              <button
                type="button"
                onClick={() => handleMoveClipUp(selectedClip)}
                className="flex items-center gap-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold cursor-pointer"
                title="Mover trecho selecionado para a camada de cima"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Camada Acima</span>
              </button>

              <button
                type="button"
                onClick={() => handleMoveClipDown(selectedClip)}
                className="flex items-center gap-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold cursor-pointer"
                title="Mover trecho selecionado para a camada de baixo"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Camada Abaixo</span>
              </button>
            </div>
          )}

          {(selectedAudioClipId || (selectedClipId && clips.length > 1)) && (
            <button
              type="button"
              onClick={handleDeleteActiveSelection}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 font-semibold transition cursor-pointer ml-1"
              title="Excluir o trecho selecionado (Atalho: Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Trecho</span>
            </button>
          )}

          <div className="hidden xl:flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 font-mono text-[11px] ml-1">
            <span className="text-slate-400">Duração:</span>
            <span className="text-emerald-400 font-bold">{formatTime(projectDuration)}</span>
          </div>
        </div>

        {/* Right side: CapCut Zoom Controls & Add Layer */}
        <div className="flex items-center gap-2 shrink-0">
          {/* CapCut Style Timeline Zoom Controls */}
          <div className="flex items-center gap-1 bg-[#141828] px-2 py-1 rounded-lg border border-slate-700/80 text-xs shadow-inner">
            <button
              type="button"
              onClick={handleFitToScreen}
              className={`p-1 rounded transition cursor-pointer ${
                zoomLevel !== 1.0 ? 'text-indigo-400 bg-indigo-950/70' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Ajustar Timeline ao Vídeo / 100% (Aproximar/Afastar)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.5, +(prev - 0.25).toFixed(2)))}
              className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
              title="Afastar Zoom (Zoom Out)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min="0.5"
              max="6.0"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-16 sm:w-20 lg:w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-cyan-400 transition"
              title={`Zoom da Timeline: ${Math.round(zoomLevel * 100)}% (Dica: Ctrl + Scroll do Mouse)`}
            />

            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(6.0, +(prev + 0.25).toFixed(2)))}
              className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
              title="Aproximar Zoom (Zoom In)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <span className="text-[10px] text-slate-400 font-mono w-7 text-right select-none">
              {Math.round(zoomLevel * 100)}%
            </span>
          </div>

          {/* Add Layer Above Button */}
          <button
            type="button"
            onClick={() => handleAddTrackAbove()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/40 text-[11px] font-bold cursor-pointer transition shadow"
            title="Adicionar uma nova faixa de camada acima"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden sm:inline">+ Nova Faixa</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition cursor-pointer"
            title="Restaurar trecho completo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Restaurar</span>
          </button>
        </div>
      </div>

      {/* Main Multi-Track Workspace */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Left Column: Track Headers with CapCut Icons */}
        <div className="w-52 border-r border-slate-800/80 bg-[#0d0f18] flex flex-col shrink-0 select-none overflow-y-auto">
          <div className="h-6 border-b border-slate-800/80 px-2 flex items-center justify-between text-[10px] text-slate-500 font-mono font-bold shrink-0">
            <span>FAIXAS & CAMADAS</span>
            <span>CONTROLE</span>
          </div>

          {/* Track Header Drop Zone / New Track Button */}
          <div
            onClick={() => handleAddTrackAbove()}
            className={`border-b px-2 flex items-center justify-between text-xs font-bold transition shrink-0 cursor-pointer ${
              dragClipState?.currentTrackId === '__new_track_above__'
                ? 'h-9 bg-indigo-950/90 border-cyan-400 text-cyan-300 border-l-4 border-l-cyan-400 shadow'
                : dragClipState
                ? 'h-8 bg-slate-900/80 border-slate-800 text-indigo-300'
                : 'h-7 bg-slate-950/40 border-slate-800/80 hover:bg-slate-900 text-slate-500 hover:text-slate-300'
            }`}
            title="Clique para adicionar uma nova faixa ou arraste um trecho para cima"
          >
            <span className="flex items-center gap-1 text-[10px]">
              <Plus className="w-3 h-3 text-cyan-400" />
              <span>Nova Faixa {tracks.length + 1}</span>
            </span>
            <span className="text-[9px] text-cyan-400 font-mono">
              {dragClipState?.currentTrackId === '__new_track_above__' ? 'SOLTAR' : '+'}
            </span>
          </div>

          {renderedTracks.map(track => {
            const trackClipsCount = (tracksClipsMap[track.id] || []).length;
            const isVisible = track.visible !== false;
            const isMuted = track.muted === true;
            const isLocked = track.locked === true;
            const isDragTarget = dragClipState?.currentTrackId === track.id;

            return (
              <div
                key={track.id}
                className={`h-12 border-b border-slate-800/60 px-2 flex items-center justify-between transition group shrink-0 ${
                  isDragTarget
                    ? 'bg-indigo-900/50 border-l-4 border-l-cyan-400'
                    : isVisible ? 'bg-[#0f121e]/90 hover:bg-[#151928]' : 'bg-[#090b12] opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-200 block truncate leading-tight">
                      {track.name}
                    </span>
                    <span className="text-[9px] text-slate-500 block truncate font-mono">
                      {trackClipsCount} {trackClipsCount === 1 ? 'trecho' : 'trechos'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleTrackLock(track.id)}
                    className={`p-1 rounded transition cursor-pointer ${
                      isLocked ? 'text-amber-400 bg-amber-950/40' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={isLocked ? 'Desbloquear faixa' : 'Bloquear faixa'}
                  >
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTrackVisibility(track.id)}
                    className={`p-1 rounded transition cursor-pointer ${
                      isVisible ? 'text-slate-400 hover:text-white' : 'text-rose-400 bg-rose-950/40'
                    }`}
                    title={isVisible ? 'Ocultar camada' : 'Exibir camada'}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTrackMute(track.id)}
                    className={`p-1 rounded transition cursor-pointer ${
                      isMuted ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 hover:text-white'
                    }`}
                    title={isMuted ? 'Desmutar áudio da faixa' : 'Mutar áudio da faixa'}
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>

                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTrack(track.id)}
                      className="p-1 rounded text-slate-600 hover:text-rose-400 cursor-pointer"
                      title="Excluir esta faixa"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Audio Track Header */}
          <div
            onClick={() => setActiveTab('audio')}
            className="h-14 px-2 flex items-center justify-between hover:bg-slate-800/30 transition cursor-pointer border-t border-slate-800/80 shrink-0"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-300 block truncate leading-tight">
                  Trilha Sonora
                </span>
                <span className="text-[9px] text-slate-400 block truncate">
                  {audioClips.length > 0 ? `${audioClips.length} trecho(s)` : (audioTrack?.url ? 'Áudio Ativo' : 'Música & Mix')}
                </span>
              </div>
            </div>
            {(audioClips.length > 0 || audioTrack?.url) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAudioClips([]);
                  setSelectedAudioClipId(null);
                  setAudioTrack(null);
                }}
                className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Remover todas as faixas de áudio"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right Area: Time Ruler & Track Lanes */}
        <div
          ref={trackAreaRef}
          onPointerDown={handlePointerDown}
          onWheel={handleTimelineWheel}
          className="relative flex-1 flex flex-col bg-[#07090f] overflow-x-auto cursor-ew-resize select-none overflow-y-auto"
        >
          {/* Zoomable Content Canvas */}
          <div
            ref={timelineContentRef}
            style={{
              width: `${Math.max(100, zoomLevel * 100)}%`,
              minWidth: '100%'
            }}
            className="relative flex-1 flex flex-col min-h-full"
          >
          {/* Time Ruler (Top - CapCut Desktop Style) */}
          <div className="h-6 border-b border-slate-800/80 relative font-mono text-[9px] text-slate-500 select-none bg-[#090b12] shrink-0 overflow-hidden">
            {tickTimes.map((t, idx) => {
              const leftPct = (t / timelineViewDuration) * 100;
              return (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                  style={{
                    left: idx === 0 ? '4px' : `${leftPct}%`,
                    transform: idx === 0 ? 'none' : leftPct > 98 ? 'translateX(-100%)' : 'translateX(-50%)'
                  }}
                >
                  <span className="leading-none pt-1 select-none font-semibold text-slate-400">
                    {formatRulerTime(t)}
                  </span>
                  <div className="w-px h-2 bg-slate-700 mt-auto mb-0.5" />
                </div>
              );
            })}
          </div>

          {/* Drop Zone: Soltar aqui para criar nova camada acima */}
          <div
            data-drop-new-track="above"
            onClick={() => handleAddTrackAbove()}
            className={`mx-1 my-0.5 rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-bold transition-all duration-150 shrink-0 relative overflow-hidden cursor-pointer ${
              dragClipState?.currentTrackId === '__new_track_above__'
                ? 'h-9 bg-indigo-600/40 border-cyan-400 text-cyan-200 shadow-xl shadow-cyan-500/30 scale-[1.01]'
                : dragClipState
                ? 'h-8 bg-slate-900/80 border-indigo-500/50 text-indigo-300'
                : 'h-7 bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60 text-slate-500 hover:text-slate-300'
            }`}
          >
            {dragClipState?.currentTrackId === '__new_track_above__' ? (
              /* Ghost preview of the clip in the new top track */
              <div
                className="absolute top-1 bottom-1 rounded bg-cyan-500/80 border border-cyan-200 text-white font-bold flex items-center justify-center px-2 text-[10px] shadow-lg animate-pulse"
                style={{
                  left: `${(dragClipState.currentStart / timelineViewDuration) * 100}%`,
                  width: `${(dragClipState.clipDur / timelineViewDuration) * 100}%`,
                  minWidth: '22px'
                }}
              >
                <span className="truncate">✨ Solte para criar Faixa {tracks.length + 1}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Plus className={`w-3.5 h-3.5 ${dragClipState ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                <span>
                  {dragClipState
                    ? `Arraste até aqui para criar Faixa ${tracks.length + 1} acima`
                    : `+ Arraste um trecho aqui ou clique para criar Faixa ${tracks.length + 1} acima`}
                </span>
              </div>
            )}
          </div>

          {/* Dynamic Track Lanes */}
          {renderedTracks.map(track => {
            const trackClips = tracksClipsMap[track.id] || [];
            const isVisible = track.visible !== false;
            const isDragTarget = dragClipState?.currentTrackId === track.id;

            return (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`h-12 border-b border-slate-800/50 relative px-1 py-1 flex items-center transition shrink-0 ${
                  isDragTarget
                    ? 'bg-indigo-950/80 ring-1 ring-cyan-400/50'
                    : isVisible ? 'bg-slate-950/60' : 'bg-slate-950/30 opacity-40'
                }`}
              >
                <div className="relative w-full h-full">
                  {/* Empty Project Track Placeholder (CapCut Desktop style) */}
                  {clips.length === 0 && track.id === 'track_1' && (
                    <div
                      onClick={() => {
                        const input = document.querySelector('input[type="file"]');
                        if (input) input.click();
                      }}
                      className="absolute inset-0 m-0.5 rounded-lg border border-dashed border-slate-700/80 bg-slate-900/40 hover:bg-slate-900/70 hover:border-indigo-500/50 flex items-center justify-center text-slate-400 hover:text-indigo-300 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Film className="w-4 h-4 text-indigo-400" />
                        <span>Arraste o material aqui ou clique para importar e começar a criar</span>
                      </div>
                    </div>
                  )}

                  {trackClips.map((clip, idx) => {
                    const isBeingDragged = dragClipState?.clipId === clip.id;
                    const effectiveStart = isBeingDragged ? dragClipState.currentStart : (clip.timelineStart || 0);

                    const leftPercent = timelineViewDuration > 0 ? (effectiveStart / timelineViewDuration) * 100 : 0;
                    const widthPercent = timelineViewDuration > 0 ? (clip.clipDur / timelineViewDuration) * 100 : 100;
                    const isSelected = clip.id === selectedClipId;
                    const speed = clip.speed || 1.0;
                    const scale = clip.scale || 100;

                    return (
                      <React.Fragment key={clip.id}>
                        {/* Ghost at original position while dragging */}
                        {isBeingDragged && (
                          <div
                            className="absolute top-0 bottom-0 rounded-md border-2 border-dashed border-indigo-500/40 bg-indigo-950/20 pointer-events-none"
                            style={{
                              left: `${((clip.timelineStart || 0) / timelineViewDuration) * 100}%`,
                              width: `${(clip.clipDur / timelineViewDuration) * 100}%`,
                              minWidth: '22px'
                            }}
                          />
                        )}

                        {/* Clip Block: Click/Drag Body moves position in time & between tracks */}
                        <div
                          onPointerDown={(e) => handleClipDragStart(e, clip)}
                          className={`group absolute top-0 bottom-0 rounded-md flex items-center justify-between transition pointer-events-auto cursor-grab active:cursor-grabbing ${
                            isBeingDragged
                              ? 'bg-gradient-to-r from-cyan-600 via-indigo-600 to-cyan-600 border-2 border-cyan-300 shadow-2xl opacity-95 scale-[1.02]'
                              : clip.layerRole === 'logo'
                              ? (isSelected
                                  ? 'bg-gradient-to-r from-fuchsia-700 via-purple-600 to-fuchsia-700 border-2 border-fuchsia-300 shadow-lg shadow-fuchsia-600/40 z-20'
                                  : 'bg-purple-900/70 hover:bg-purple-900/90 border border-fuchsia-500/60')
                              : clip.layerRole === 'background'
                              ? (isSelected
                                  ? 'bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 border-2 border-amber-300 shadow-lg shadow-amber-600/40 z-20'
                                  : 'bg-amber-950/70 hover:bg-amber-950/90 border border-amber-500/50')
                              : isSelected
                              ? 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-700 border-2 border-indigo-400 shadow-lg shadow-indigo-600/40 z-20'
                              : 'bg-slate-800 hover:bg-slate-750 border border-slate-650'
                          }`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            minWidth: '22px',
                            transform: isBeingDragged ? `translateY(${dragClipState.deltaY || 0}px)` : undefined,
                            zIndex: isBeingDragged ? 9999 : isSelected ? 20 : 10
                          }}
                        >
                          {/* Left Trim Handle (arrastar para encurtar/esticar início) */}
                          <div
                            onPointerDown={(e) => handleEdgeTrimPointerDown(e, clip, 'left')}
                            className="w-2.5 h-full rounded-l bg-indigo-500/30 hover:bg-cyan-400 group-hover:bg-indigo-400/80 cursor-ew-resize flex items-center justify-center shrink-0 z-30 transition"
                            title="Arrastar borda inicial para ajustar corte do início"
                          >
                            <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                          </div>

                          {/* Clip Body Content (Drag handle indicator) */}
                          <div className="flex-1 px-1.5 flex flex-col justify-between h-full py-1 min-w-0 pointer-events-none overflow-hidden">
                            <div className="flex items-center justify-between text-[10px]">
                              <div className="flex items-center gap-1 min-w-0">
                                <Move className="w-2.5 h-2.5 text-slate-400 opacity-60 shrink-0" />
                                {clip.layerRole === 'logo' && (
                                  <span className="px-1 rounded bg-fuchsia-500/40 text-fuchsia-100 font-bold text-[8px] shrink-0">
                                    Logo
                                  </span>
                                )}
                                {clip.layerRole === 'background' && (
                                  <span className="px-1 rounded bg-amber-500/40 text-amber-100 font-bold text-[8px] shrink-0">
                                    Fundo
                                  </span>
                                )}
                                <span className="font-bold text-white truncate text-[10px]">
                                  {clip.videoName ? clip.videoName.slice(0, 16) : `Trecho`}
                                </span>
                                {speed !== 1.0 && (
                                  <span className="px-1 rounded bg-amber-500/40 text-amber-200 font-bold text-[8px]">
                                    {speed}x
                                  </span>
                                )}
                                {scale !== 100 && (
                                  <span className="px-1 rounded bg-cyan-500/40 text-cyan-200 font-bold text-[8px]">
                                    {scale}%
                                  </span>
                                )}
                                {clip.enhancement && clip.enhancement !== 'none' && (
                                  <span className="px-1 rounded bg-emerald-500/40 text-emerald-200 font-bold text-[8px]">
                                    ✨
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-indigo-200 font-semibold truncate ml-1 text-[9px]">
                                {clip.clipDur.toFixed(1)}s
                              </span>
                            </div>

                            <div className="flex items-center justify-between font-mono text-[8px] text-slate-300 opacity-80">
                              <span>{formatTime(effectiveStart)}</span>
                              <span>{formatTime(effectiveStart + clip.clipDur)}</span>
                            </div>
                          </div>

                          {/* Right Trim Handle (arrastar para encurtar/esticar fim) */}
                          <div
                            onPointerDown={(e) => handleEdgeTrimPointerDown(e, clip, 'right')}
                            className="w-2.5 h-full rounded-r bg-indigo-500/30 hover:bg-cyan-400 group-hover:bg-indigo-400/80 cursor-ew-resize flex items-center justify-center shrink-0 z-30 transition"
                            title="Arrastar borda final para ajustar corte do fim"
                          >
                            <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                          </div>
                        </div>

                        {/* Transition Button Between Consecutive Clips on this track */}
                        {idx < trackClips.length - 1 && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -ml-3 z-30 pointer-events-auto"
                            style={{ left: `${((clip.timelineStart + clip.clipDur) / timelineViewDuration) * 100}%` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedClipId(clip.id);
                              setActiveTab('transitions');
                            }}
                          >
                            <button
                              type="button"
                              className={`w-5 h-5 rounded-full flex items-center justify-center border shadow-lg transition cursor-pointer ${
                                clip.transitionToNext && clip.transitionToNext !== 'none'
                                ? 'bg-amber-500 border-amber-300 text-slate-950 scale-110'
                                : 'bg-slate-800 hover:bg-slate-750 border-slate-600 text-slate-300'
                              }`}
                              title="Abrir painel de Transições para este corte"
                            >
                              <ArrowRightLeft className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Audio Track Lane */}
          <div className="h-14 relative px-1 py-1 flex items-center bg-slate-950/40 border-t border-slate-800/80 shrink-0">
            {(() => {
              const displayAudioClips = audioClips.length > 0
                ? audioClips
                : (audioTrack?.url ? [{
                    id: 'legacy_audio',
                    name: audioTrack.name || 'Trilha Sonora',
                    url: audioTrack.url,
                    path: audioTrack.path,
                    duration: audioTrack.duration || projectDuration || 10,
                    start: 0,
                    end: audioTrack.duration || projectDuration || 10,
                    timelineStart: audioTrack.timelineStart || 0,
                    volume: 1,
                    speed: 1,
                    fadeIn: 0,
                    fadeOut: 0,
                    muted: false
                  }] : []);

              if (displayAudioClips.length === 0) {
                return (
                  <div
                    onClick={() => setActiveTab('audio')}
                    className="w-full h-full rounded border border-dashed border-slate-800 flex items-center justify-center text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer transition"
                  >
                    + Adicionar Trilha Sonora Independente
                  </div>
                );
              }

              return displayAudioClips.map((ac) => {
                const aStart = ac.timelineStart || 0;
                const aSpeed = ac.speed || 1;
                const aSourceDur = Math.max(0.1, (ac.end || ac.duration || projectDuration || 10) - (ac.start || 0));
                const aDur = aSourceDur / aSpeed;
                const leftPct = Math.max(0, (aStart / timelineViewDuration) * 100);
                const widthPct = Math.max(2, Math.min(100 - leftPct, (aDur / timelineViewDuration) * 100));
                const isSelected = ac.id === selectedAudioClipId;

                return (
                  <div
                    key={ac.id}
                    onPointerDown={(e) => handleAudioClipDragStart(e, ac)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipId(null);
                      setSelectedAudioClipId(ac.id);
                      setActiveTab('audio');
                    }}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden select-none cursor-grab active:cursor-grabbing group transition-shadow ${
                      isSelected
                        ? 'bg-emerald-950/90 border-2 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.4)] z-10'
                        : 'bg-gradient-to-r from-emerald-900/80 to-emerald-950/80 border border-emerald-500/60 hover:border-emerald-400'
                    }`}
                  >
                    {/* Waveform + Volume Line + Fade Ramps */}
                    <AudioClipWaveform
                      url={ac.url}
                      start={ac.start || 0}
                      end={ac.end || ac.duration || aSourceDur}
                      duration={ac.duration || aSourceDur}
                      volume={ac.muted ? 0 : (ac.volume ?? 1)}
                      fadeIn={ac.fadeIn || 0}
                      fadeOut={ac.fadeOut || 0}
                      speed={aSpeed}
                    />

                    {/* Left Trim Handle */}
                    <div
                      onPointerDown={(e) => handleAudioTrimStart(e, ac, 'left')}
                      title="Ajustar início do áudio"
                      className="absolute left-0 top-0 bottom-0 w-2.5 bg-emerald-400/25 hover:bg-emerald-400/80 border-l-2 border-emerald-300/70 cursor-ew-resize z-20 transition"
                    />

                    {/* Right Trim Handle */}
                    <div
                      onPointerDown={(e) => handleAudioTrimStart(e, ac, 'right')}
                      title="Ajustar fim do áudio"
                      className="absolute right-0 top-0 bottom-0 w-2.5 bg-emerald-400/25 hover:bg-emerald-400/80 border-r-2 border-emerald-300/70 cursor-ew-resize z-20 transition"
                    />

                    {/* Labels & Badges */}
                    <div className="relative z-10 h-full px-2.5 flex items-center justify-between gap-1 text-[10px] text-emerald-100 font-semibold pointer-events-none">
                      <div className="flex items-center gap-1.5 truncate min-w-0">
                        <Music className="w-3 h-3 text-emerald-300 shrink-0" />
                        <span className="truncate drop-shadow">{ac.name || 'Áudio'}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                        <span className="px-1 py-0.5 rounded bg-slate-950/75 text-amber-300 font-mono text-[8px]">
                          {ac.muted ? '0%' : `${Math.round((ac.volume ?? 1) * 100)}%`}
                        </span>
                        {Math.abs(aSpeed - 1) > 0.01 && (
                          <span className="px-1 py-0.5 rounded bg-slate-950/75 text-cyan-300 font-mono text-[8px]">
                            {aSpeed.toFixed(1)}x
                          </span>
                        )}
                        {(ac.fadeIn > 0 || ac.fadeOut > 0) && (
                          <span className="px-1 py-0.5 rounded bg-slate-950/75 text-emerald-300 font-mono text-[8px]">
                            F
                          </span>
                        )}
                        <span className="font-mono text-emerald-300 text-[9px] hidden sm:inline">
                          {aDur.toFixed(1)}s
                        </span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Magnetic Snap Guide Vertical Line */}
          {snapGuideTime !== null && timelineViewDuration > 0 && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-35 w-[1.5px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
              style={{ left: `${(snapGuideTime / timelineViewDuration) * 100}%` }}
            />
          )}

          {/* GLOBAL NEEDLE / SCRUBBER (Agulha Amarela atravessando todas as camadas) */}
          {timelineViewDuration > 0 && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-40 transition-none flex flex-col items-center"
              style={{ left: `${currentPercent}%` }}
            >
              {/* Needle Head */}
              <div className="w-3.5 h-3.5 -mt-0.5 bg-amber-400 rounded-sm shadow-md border border-amber-200 rotate-45 shrink-0" />
              {/* Needle Line down across all tracks */}
              <div className="w-[2px] flex-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Bottom helper text */}
      <div className="px-4 py-1 bg-[#090b12] border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
        <span className="truncate">
          💡 <strong>Arraste para cima</strong> para criar nova camada automaticamente. <strong>Arraste para os lados</strong> para posicionar no tempo.
        </span>
        <span className="font-mono text-slate-400 shrink-0 ml-2">
          Cursor: <strong className="text-amber-400">{formatTime(currentTime)}</strong> / {formatTime(projectDuration)}
        </span>
      </div>
    </div>
  );
}
