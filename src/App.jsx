import React, { useState, useRef, useEffect } from 'react';
import {
  Scissors,
  Volume2,
  Sparkles,
  Subtitles,
  Layers,
  Upload,
  Video,
  ZoomIn,
  Gauge,
  FolderPlus,
  Image as ImageIcon,
  Cpu,
  Loader2
} from 'lucide-react';
import { uploadMediaWithProgress } from './utils/uploadHelper.js';

import Header from './components/Header.jsx';
import Player from './components/Player.jsx';
import Timeline from './components/Timeline.jsx';
import TrimPanel from './components/TrimPanel.jsx';
import TransformPanel from './components/TransformPanel.jsx';
import SpeedPanel from './components/SpeedPanel.jsx';
import AudioPanel from './components/AudioPanel.jsx';
import EnhancePanel from './components/EnhancePanel.jsx';
import SubtitlesPanel from './components/SubtitlesPanel.jsx';
import TransitionsPanel from './components/TransitionsPanel.jsx';
import MediaPanel from './components/MediaPanel.jsx';
import OverlayPanel from './components/OverlayPanel.jsx';
import ExportModal from './components/ExportModal.jsx';
import ProjectModal from './components/ProjectModal.jsx';
import { useDialog } from './components/DialogProvider.jsx';

export default function App() {
  const { showAlert } = useDialog();
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Media Library (Multi-Video / Multi-Audio / Images)
  const [mediaList, setMediaList] = useState([]);

  // Dynamic Tracks (Layers): Faixa 1 (bottom), Faixa 2 (above), etc.
  const [tracks, setTracks] = useState([
    { id: 'track_1', name: 'Faixa 1', visible: true, muted: false, locked: false }
  ]);

  // Multi-clip Editing State (Starts clean and empty, like CapCut Desktop)
  const [clips, setClips] = useState([]);
  const [selectedClipId, setSelectedClipId] = useState(null);

  // Aspect Ratio & Layout
  const [targetAspect, setTargetAspect] = useState('auto'); // 'auto' | '9:16' | '16:9' | '1:1' | '4:5'

  // Layer 1: Background Layer (Fundo / Camada Inferior)
  const [backgroundLayer, setBackgroundLayer] = useState(null);

  // Logo / Image Overlay (Layer 3 - Top)
  const [logoOverlay, setLogoOverlay] = useState({
    enabled: false,
    path: '',
    url: '',
    name: '',
    position: 'top-right',
    scale: 15,
    opacity: 100
  });

  // Audio State
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1.0);
  const [audioFadeIn, setAudioFadeIn] = useState(0);
  const [audioFadeOut, setAudioFadeOut] = useState(0);
  const [audioTrack, setAudioTrack] = useState(null);
  const [audioClips, setAudioClips] = useState([]);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState(null);
  const [audioVolume, setAudioVolume] = useState(1.0);
  const [audioLoop, setAudioLoop] = useState(false);

  // Filters & Subtitles
  const [enhancement, setEnhancement] = useState('none');
  const [verticalAspect, setVerticalAspect] = useState(false);
  const [transitions, setTransitions] = useState({ fadeIn: 0, fadeOut: 0 });
  const [subtitles, setSubtitles] = useState([]);
  const [subtitleStyle, setSubtitleStyle] = useState({
    color: '#FACC15',
    fontSize: 22,
    bold: true
  });
  const [silences, setSilences] = useState([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState('trim');

  // Project Save / Auto-Save Recovery State
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('Sem título');
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [importProgress, setImportProgress] = useState(null); // { fileName, stage, percent, codec, encoder, message }
  const hasRestoredRef = useRef(false);

  // Export Modal State
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({ percent: 0 });
  const [renderedResult, setRenderedResult] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // Undo / Redo History System (Ctrl+Z / Ctrl+Y)
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoAction = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistorySnapshot = (newClips, newTracks, newSelectedId) => {
    if (isUndoRedoAction.current) return;
    const currentClips = newClips || clips;
    const currentTracks = newTracks || tracks;
    const currentSelectedId = newSelectedId || selectedClipId;

    const snapshot = {
      clips: JSON.parse(JSON.stringify(currentClips)),
      tracks: JSON.parse(JSON.stringify(currentTracks)),
      selectedClipId: currentSelectedId
    };

    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
    truncated.push(snapshot);
    if (truncated.length > 60) truncated.shift();

    historyRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const undo = () => {
    if (historyIndexRef.current > 0) {
      isUndoRedoAction.current = true;
      historyIndexRef.current -= 1;
      const targetState = historyRef.current[historyIndexRef.current];
      setClips(JSON.parse(JSON.stringify(targetState.clips)));
      setTracks(JSON.parse(JSON.stringify(targetState.tracks)));
      if (targetState.selectedClipId) setSelectedClipId(targetState.selectedClipId);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      setTimeout(() => { isUndoRedoAction.current = false; }, 60);
    }
  };

  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isUndoRedoAction.current = true;
      historyIndexRef.current += 1;
      const targetState = historyRef.current[historyIndexRef.current];
      setClips(JSON.parse(JSON.stringify(targetState.clips)));
      setTracks(JSON.parse(JSON.stringify(targetState.tracks)));
      if (targetState.selectedClipId) setSelectedClipId(targetState.selectedClipId);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      setTimeout(() => { isUndoRedoAction.current = false; }, 60);
    }
  };

  // ============================================================
  // PROJECT SNAPSHOT, AUTO-SAVE & RECOVERY
  // ============================================================
  const buildProjectSnapshot = () => ({
    videoUrl,
    videoPath,
    videoInfo,
    duration,
    mediaList,
    tracks,
    clips,
    selectedClipId,
    targetAspect,
    backgroundLayer,
    logoOverlay,
    muteOriginal,
    originalVolume,
    audioFadeIn,
    audioFadeOut,
    audioTrack,
    audioClips,
    selectedAudioClipId,
    audioVolume,
    audioLoop,
    enhancement,
    verticalAspect,
    transitions,
    subtitles,
    subtitleStyle,
    silences
  });

  const applyProjectSnapshot = (data) => {
    if (!data || typeof data !== 'object') return;
    setVideoFile(null);
    setVideoUrl(data.videoUrl || '');
    setVideoPath(data.videoPath || '');
    setVideoInfo(data.videoInfo || null);
    setDuration(Number(data.duration) || 0);
    setCurrentTime(0);
    setMediaList(Array.isArray(data.mediaList) ? data.mediaList : []);
    setTracks(
      Array.isArray(data.tracks) && data.tracks.length > 0
        ? data.tracks
        : [{ id: 'track_1', name: 'Faixa 1', visible: true, muted: false, locked: false }]
    );
    setClips(Array.isArray(data.clips) ? data.clips : []);
    setSelectedClipId(data.selectedClipId || (Array.isArray(data.clips) && data.clips[0]?.id) || null);
    setTargetAspect(data.targetAspect || 'auto');
    setBackgroundLayer(data.backgroundLayer || null);
    setLogoOverlay(
      data.logoOverlay || {
        enabled: false,
        path: '',
        url: '',
        name: '',
        position: 'top-right',
        scale: 15,
        opacity: 100
      }
    );
    setMuteOriginal(Boolean(data.muteOriginal));
    setOriginalVolume(data.originalVolume !== undefined ? Number(data.originalVolume) : 1.0);
    setAudioFadeIn(Number(data.audioFadeIn) || 0);
    setAudioFadeOut(Number(data.audioFadeOut) || 0);
    const loadedAudioTrack = data.audioTrack || null;
    let loadedAudioClips = Array.isArray(data.audioClips) ? data.audioClips : [];
    if (loadedAudioClips.length === 0 && loadedAudioTrack?.url) {
      const dur = loadedAudioTrack.duration || Number(data.duration) || 10;
      loadedAudioClips = [{
        id: `aclip_${Date.now()}`,
        name: loadedAudioTrack.name || 'Trilha Sonora',
        path: loadedAudioTrack.path,
        url: loadedAudioTrack.url,
        duration: dur,
        start: 0,
        end: dur,
        timelineStart: loadedAudioTrack.timelineStart || 0,
        volume: data.audioVolume !== undefined ? Number(data.audioVolume) : 1.0,
        speed: 1.0,
        fadeIn: 0,
        fadeOut: 0,
        muted: false
      }];
    }
    setAudioTrack(loadedAudioTrack);
    setAudioClips(loadedAudioClips);
    setSelectedAudioClipId(data.selectedAudioClipId || loadedAudioClips[0]?.id || null);
    setAudioVolume(data.audioVolume !== undefined ? Number(data.audioVolume) : 1.0);
    setAudioLoop(Boolean(data.audioLoop));
    setEnhancement(data.enhancement || 'none');
    setVerticalAspect(Boolean(data.verticalAspect));
    setTransitions(data.transitions || { fadeIn: 0, fadeOut: 0 });
    setSubtitles(Array.isArray(data.subtitles) ? data.subtitles : []);
    setSubtitleStyle(data.subtitleStyle || { color: '#FACC15', fontSize: 22, bold: true });
    setSilences(Array.isArray(data.silences) ? data.silences : []);
  };

  const handleSaveProject = async (nameToSave, existingId = null) => {
    const cleanName = String(nameToSave || '').trim() || 'Projeto sem título';
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingId || (cleanName === projectName ? projectId : null),
          name: cleanName,
          data: buildProjectSnapshot()
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveStatus('idle');
        return { ok: false, error: json.error || 'Erro ao salvar' };
      }
      setProjectId(json.id);
      setProjectName(json.name);
      setSaveStatus('saved');
      return { ok: true, id: json.id, name: json.name };
    } catch (err) {
      setSaveStatus('idle');
      return { ok: false, error: 'Erro de conexão ao salvar.' };
    }
  };

  const handleLoadProject = (proj) => {
    if (!proj || !proj.data) return;
    setProjectId(proj.id || null);
    setProjectName(proj.name || 'Sem título');
    applyProjectSnapshot(proj.data);
    setSaveStatus('saved');
  };

  const handleNewProject = async () => {
    setProjectId(null);
    setProjectName('Sem título');
    applyProjectSnapshot({});
    setSaveStatus('idle');
    try {
      localStorage.removeItem('studiocut_autosave_v1');
      await fetch('/api/projects/autosave', { method: 'DELETE' });
    } catch (e) {
      // ignore
    }
  };

  // Restore auto-saved draft on initial mount (protects against F5 / crash)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let localDraft = null;
      try {
        const rawLocal = localStorage.getItem('studiocut_autosave_v1');
        if (rawLocal) localDraft = JSON.parse(rawLocal);
      } catch (e) {
        // ignore corrupted localStorage
      }

      let serverDraft = null;
      try {
        const res = await fetch('/api/projects/autosave');
        if (res.ok) {
          const json = await res.json();
          if (json && json.exists && json.data) {
            serverDraft = json;
          }
        }
      } catch (e) {
        // ignore network error
      }

      if (cancelled) return;

      let chosen = null;
      if (localDraft?.data && serverDraft?.data) {
        const localTime = new Date(localDraft.updatedAt || 0).getTime();
        const serverTime = new Date(serverDraft.updatedAt || 0).getTime();
        chosen = localTime >= serverTime ? localDraft : serverDraft;
      } else {
        chosen = serverDraft || localDraft;
      }

      const hasMeaningfulContent =
        chosen?.data &&
        ((Array.isArray(chosen.data.clips) && chosen.data.clips.length > 0) ||
          (Array.isArray(chosen.data.audioClips) && chosen.data.audioClips.length > 0) ||
          Boolean(chosen.data.audioTrack) ||
          Boolean(chosen.data.backgroundLayer));

      if (hasMeaningfulContent) {
        setProjectId(chosen.projectId || null);
        setProjectName(chosen.projectName || 'Sem título');
        applyProjectSnapshot(chosen.data);
        setSaveStatus('saved');
      } else {
        try {
          localStorage.removeItem('studiocut_autosave_v1');
        } catch (e) {}
      }

      hasRestoredRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced continuous auto-save (800ms) to localStorage + temp file on disk
  useEffect(() => {
    if (!hasRestoredRef.current) return;

    const snapshot = buildProjectSnapshot();
    const hasTimelineContent =
      snapshot.clips.length > 0 ||
      snapshot.audioClips.length > 0 ||
      Boolean(snapshot.audioTrack) ||
      Boolean(snapshot.backgroundLayer);

    if (!hasTimelineContent) {
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const payload = {
        projectId,
        projectName,
        updatedAt: new Date().toISOString(),
        data: snapshot
      };
      try {
        localStorage.setItem('studiocut_autosave_v1', JSON.stringify(payload));
      } catch (e) {
        // ignore quota errors
      }
      try {
        await fetch('/api/projects/autosave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('idle');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    projectId,
    projectName,
    videoUrl,
    videoPath,
    videoInfo,
    duration,
    mediaList,
    tracks,
    clips,
    selectedClipId,
    targetAspect,
    backgroundLayer,
    logoOverlay,
    muteOriginal,
    originalVolume,
    audioFadeIn,
    audioFadeOut,
    audioTrack,
    audioClips,
    selectedAudioClipId,
    audioVolume,
    audioLoop,
    enhancement,
    verticalAspect,
    transitions,
    subtitles,
    subtitleStyle,
    silences
  ]);

  // Keyboard shortcut listener for Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, and Ctrl+S
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (projectId && projectName && projectName !== 'Sem título') {
          handleSaveProject(projectName, projectId);
        } else {
          setIsProjectsOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [projectId, projectName]);

  // Calculate total timeline duration whenever clips change
  useEffect(() => {
    if (clips.length > 0) {
      const maxEnd = Math.max(...clips.map(c => (c.timelineStart || 0) + ((c.end - c.start) / (c.speed || 1.0))));
      if (maxEnd > 0) {
        setDuration(maxEnd);
      }
    } else {
      setDuration(0);
    }
  }, [clips]);

  // Hardware & GPU info (auto-detected on startup)
  const [systemInfo, setSystemInfo] = useState({
    gpuName: 'NVIDIA GeForce RTX 4070 Laptop GPU',
    encoder: 'h264_nvenc',
    encoderType: 'nvenc',
    encoderLabel: 'NVIDIA NVENC',
    isHardwareAccelerated: true
  });

  // Load existing media and probe hardware on start
  useEffect(() => {
    fetch('/api/media')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.media) {
          setMediaList(data.media);
        }
      })
      .catch(err => console.error('Erro ao listar mídias:', err));

    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data && data.gpuName) {
          setSystemInfo({
            gpuName: data.gpuName,
            encoder: data.encoder,
            encoderType: data.encoderType,
            encoderLabel: data.encoderLabel,
            isHardwareAccelerated: data.isHardwareAccelerated !== false
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || importProgress) return;

    try {
      const data = await uploadMediaWithProgress(file, setImportProgress);
      if (data.success) {
        setVideoFile(file);
        setVideoUrl(data.url);
        setVideoPath(data.path);
        setVideoInfo(data.info);
        const dur = data.info?.duration || 0;
        setDuration(dur);

        // Add to project media pool (avoid duplicates in this project)
        setMediaList(prev => {
          if (prev.some(m => m.url === data.url || m.path === data.path)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `media_${Date.now()}`,
              name: data.originalName,
              filename: data.filename,
              path: data.path,
              url: data.url,
              type: 'video',
              duration: dur,
              width: data.info?.width || 0,
              height: data.info?.height || 0
            }
          ];
        });

        const newClipId = `clip_${Date.now()}`;
        setClips([
          {
            id: newClipId,
            trackId: 'track_1',
            start: 0,
            end: dur,
            videoUrl: data.url,
            videoPath: data.path,
            videoName: data.originalName,
            transitionToNext: 'none',
            speed: 1.0,
            scale: 100,
            posX: 0,
            posY: 0,
            fadeIn: 0,
            fadeOut: 0,
            volume: 1.0,
            muted: false
          }
        ]);
        setSelectedClipId(newClipId);
        setCurrentTime(0);
        setSubtitles([]);
        setSilences([]);
        if (data.reused) {
          showAlert({
            title: 'Mídia Reutilizada',
            message: `O arquivo "${data.originalName}" já havia sido importado antes e foi carregado instantaneamente sem duplicar na pasta uploads.`,
            variant: 'success'
          });
        }
      } else {
        showAlert('Erro no envio do arquivo: ' + (data.error || 'Desconhecido'));
      }
    } catch (err) {
      showAlert('Erro ao importar vídeo: ' + err.message);
    } finally {
      setImportProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  // Add another video from Media Pool to Timeline (Camada / Faixa 1)
  const handleAddClipToTimeline = (mediaItem) => {
    const isProjectEmpty = !videoUrl || clips.length === 0 || (clips.length === 1 && clips[0].end === 0);

    const maxEndOnTrack = clips
      .filter(c => (c.trackId || 'track_1') === 'track_1' && c.end > 0)
      .reduce((max, c) => Math.max(max, (c.timelineStart || 0) + (c.end - c.start) / (c.speed || 1.0)), 0);

    const newClip = {
      id: `clip_${Date.now()}`,
      trackId: 'track_1',
      start: 0,
      end: mediaItem.duration,
      timelineStart: isProjectEmpty ? 0 : maxEndOnTrack,
      videoUrl: mediaItem.url,
      videoPath: mediaItem.path,
      videoName: mediaItem.name,
      transitionToNext: 'none',
      speed: 1.0,
      scale: 100,
      posX: 0,
      posY: 0,
      fadeIn: 0,
      fadeOut: 0,
      volume: 1.0,
      muted: false
    };

    if (isProjectEmpty) {
      setVideoFile({ name: mediaItem.name });
      setVideoUrl(mediaItem.url);
      setVideoPath(mediaItem.path);
      setVideoInfo({
        duration: mediaItem.duration,
        width: mediaItem.width || 0,
        height: mediaItem.height || 0
      });
      setDuration(mediaItem.duration);
      setClips([newClip]);
      setSelectedClipId(newClip.id);
      setCurrentTime(0);
    } else {
      setClips(prev => [...prev.filter(c => c.end > 0), newClip]);
      setSelectedClipId(newClip.id);
    }
  };

  const getProjectSpanDuration = () => {
    const clipEnds = clips.map(c => (c.timelineStart || 0) + ((c.end - c.start) / (c.speed || 1.0)));
    return Math.max(duration || 0, ...clipEnds, 10);
  };

  const handleSetBackgroundLayer = (mediaItem) => {
    if (!mediaItem) {
      setBackgroundLayer(null);
      setClips(prev => prev.filter(c => c.layerRole !== 'background'));
      return;
    }

    const totalDur = getProjectSpanDuration();
    const bottomTrackId = tracks[0]?.id || 'track_1';
    const bottomHasNonBg = clips.some(c => (c.trackId || 'track_1') === bottomTrackId && c.layerRole !== 'background');

    let nextTracks = [...tracks];
    let shiftedClips = [...clips];

    if (bottomHasNonBg) {
      // Shift all existing tracks' clips up by +1 track so Faixa 1 is exclusive for the background
      const maxUsedIdx = clips.reduce((acc, c) => {
        const idx = nextTracks.findIndex(t => t.id === (c.trackId || 'track_1'));
        return Math.max(acc, idx >= 0 ? idx : 0);
      }, 0);

      while (nextTracks.length <= maxUsedIdx + 1) {
        nextTracks.push({
          id: `track_${Date.now()}_${nextTracks.length + 1}`,
          name: `Faixa ${nextTracks.length + 1}`,
          visible: true,
          muted: false,
          locked: false
        });
      }

      shiftedClips = clips.map(c => {
        const idx = nextTracks.findIndex(t => t.id === (c.trackId || 'track_1'));
        const targetTrack = nextTracks[(idx >= 0 ? idx : 0) + 1];
        return targetTrack ? { ...c, trackId: targetTrack.id } : c;
      });
    }

    const bgClip = {
      id: `bg_${Date.now()}`,
      trackId: nextTracks[0].id,
      videoPath: mediaItem.path,
      videoUrl: mediaItem.url,
      videoName: mediaItem.name || 'Fundo',
      clipType: mediaItem.type === 'video' ? 'video' : 'image',
      layerRole: 'background',
      start: 0,
      end: totalDur,
      maxDuration: Math.max(totalDur * 3, 600),
      timelineStart: 0,
      speed: 1.0,
      scale: 100,
      posX: 0,
      posY: 0,
      muted: true,
      transitionToNext: 'none'
    };

    const nextClips = [...shiftedClips, bgClip];
    setTracks(nextTracks);
    setClips(nextClips);
    setSelectedAudioClipId(null);
    setSelectedClipId(bgClip.id);
    setBackgroundLayer(null);
    pushHistory(nextClips, nextTracks, bgClip.id);
    setActiveTab('transform');
  };

  const handleSetAudioTrack = (mediaItem) => {
    const newId = `aclip_${Date.now()}`;
    const dur = mediaItem.duration || 10;
    setAudioTrack({
      name: mediaItem.name,
      path: mediaItem.path,
      url: mediaItem.url,
      duration: dur,
      timelineStart: 0
    });
    setAudioClips(prev => [
      ...prev,
      {
        id: newId,
        name: mediaItem.name,
        path: mediaItem.path,
        url: mediaItem.url,
        start: 0,
        end: dur,
        timelineStart: 0,
        speed: 1.0,
        volume: 1.0,
        fadeIn: 0,
        fadeOut: 0,
        muted: false
      }
    ]);
    setSelectedAudioClipId(newId);
    setActiveTab('audio');
  };

  const handleSetLogoOverlay = (mediaItem) => {
    const totalDur = getProjectSpanDuration();
    const newTrack = {
      id: `track_${Date.now()}`,
      name: `Faixa ${tracks.length + 1}`,
      visible: true,
      muted: false,
      locked: false
    };
    const logoClip = {
      id: `logo_${Date.now()}`,
      trackId: newTrack.id,
      videoPath: mediaItem.path,
      videoUrl: mediaItem.url,
      videoName: mediaItem.name || 'Logo',
      clipType: 'image',
      layerRole: 'logo',
      position: 'top-right',
      scale: 15,
      opacity: 100,
      start: 0,
      end: totalDur,
      maxDuration: Math.max(totalDur * 3, 600),
      timelineStart: 0,
      speed: 1.0,
      posX: 0,
      posY: 0,
      muted: true,
      transitionToNext: 'none'
    };
    const nextTracks = [...tracks, newTrack];
    const nextClips = [...clips, logoClip];
    setTracks(nextTracks);
    setClips(nextClips);
    setSelectedAudioClipId(null);
    setSelectedClipId(logoClip.id);
    setLogoOverlay(prev => ({ ...prev, enabled: false }));
    pushHistory(nextClips, nextTracks, logoClip.id);
    setActiveTab('overlay');
  };

  const startRender = async (exportSettings) => {
    setIsRendering(true);
    setRenderedResult(null);
    setRenderProgress({ percent: 0 });

    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputVideo: videoPath,
          clips,
          tracks,
          targetAspect,
          backgroundLayer: backgroundLayer?.path ? backgroundLayer : null,
          logoOverlay: logoOverlay.enabled ? logoOverlay : null,
          muteOriginal,
          originalVolume,
          audioFadeIn,
          audioFadeOut,
          audioTrack: audioTrack?.path || null,
          audioClips,
          audioVolume,
          audioLoop,
          enhancement,
          verticalAspect,
          transitions,
          subtitles,
          subtitleStyle,
          resolution: exportSettings.resolution,
          useNvenc: exportSettings.useNvenc,
          totalDuration: duration
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const eventMatch = line.match(/^event:\s*(\w+)/m);
          const dataMatch = line.match(/^data:\s*(.+)$/m);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (event === 'progress') {
              setRenderProgress(data);
            } else if (event === 'done') {
              setIsRendering(false);
              setRenderedResult(data);
            } else if (event === 'error') {
              setIsRendering(false);
              showAlert('Erro na renderização: ' + data.error);
            }
          }
        }
      }
    } catch (err) {
      setIsRendering(false);
      showAlert('Erro ao comunicar com o servidor de renderização: ' + err.message);
    }
  };

  const tabs = [
    { id: 'media', label: 'Mídias', icon: FolderPlus, highlight: true },
    { id: 'trim', label: 'Corte', icon: Scissors },
    { id: 'transform', label: 'Escala/Zoom', icon: ZoomIn },
    { id: 'overlay', label: 'Logo/Selo', icon: ImageIcon },
    { id: 'speed', label: 'Velocidade', icon: Gauge },
    { id: 'audio', label: 'Áudio & Fade', icon: Volume2 },
    { id: 'enhance', label: 'Melhorar', icon: Sparkles },
    { id: 'subtitles', label: 'Legendas', icon: Subtitles },
    { id: 'transitions', label: 'Transições', icon: Layers }
  ];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0f17] text-slate-100 overflow-hidden select-none">
      {/* Top Header */}
      <Header
        onUploadClick={() => fileInputRef.current?.click()}
        onExportClick={() => setIsExportOpen(true)}
        hasVideo={!!videoUrl}
        isRendering={isRendering}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        systemInfo={systemInfo}
        projectName={projectName}
        saveStatus={saveStatus}
        onSaveClick={() => {
          if (projectId && projectName && projectName !== 'Sem título') {
            handleSaveProject(projectName, projectId);
          } else {
            setIsProjectsOpen(true);
          }
        }}
        onProjectsClick={() => setIsProjectsOpen(true)}
        isImporting={!!importProgress}
      />

      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        className="hidden"
        onChange={handleVideoUpload}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Video Player with Auto Aspect Ratio & Logo */}
        <Player
          videoUrl={videoUrl}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          duration={duration}
          subtitles={subtitles}
          subtitleStyle={subtitleStyle}
          muteOriginal={muteOriginal}
          enhancement={enhancement}
          targetAspect={targetAspect}
          setTargetAspect={setTargetAspect}
          videoInfo={videoInfo}
          videoRef={videoRef}
          clips={clips}
          tracks={tracks}
          logoOverlay={logoOverlay}
          backgroundLayer={backgroundLayer}
          audioClips={audioClips}
          audioTrack={audioTrack}
          audioVolume={audioVolume}
        />

        {/* Right Sidebar: Tools & Tabs */}
        <div className="w-84 md:w-96 lg:w-[420px] border-l border-slate-800 bg-[#121522] flex flex-col z-10 shrink-0">
          {/* Navigation Tabs (Smooth scrollbar, clean icons) */}
          <div className="flex border-b border-slate-800 bg-[#0f121d] overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[50px] py-2.5 px-0.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition border-b-2 cursor-pointer ${
                    isActive
                      ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                  title={tab.label}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${tab.highlight ? 'text-cyan-400' : ''}`} />
                  <span className="truncate w-full text-center tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 p-4 overflow-y-auto">
            {activeTab === 'media' && (
              <MediaPanel
                mediaList={mediaList}
                setMediaList={setMediaList}
                onAddClipToTimeline={handleAddClipToTimeline}
                onSetAudioTrack={handleSetAudioTrack}
                onSetLogoOverlay={handleSetLogoOverlay}
                onSetBackgroundLayer={handleSetBackgroundLayer}
                backgroundLayer={backgroundLayer}
                logoOverlay={logoOverlay}
                audioTrack={audioTrack}
                clips={clips}
              />
            )}

            {activeTab === 'trim' && (
              <TrimPanel
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
                setSelectedClipId={setSelectedClipId}
                duration={duration}
                currentTime={currentTime}
                videoPath={videoPath}
                silences={silences}
                setSilences={setSilences}
                setCurrentTime={setCurrentTime}
                videoRef={videoRef}
              />
            )}

            {activeTab === 'transform' && (
              <TransformPanel
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
                videoInfo={videoInfo}
                targetAspect={targetAspect}
                enhancement={enhancement}
                setEnhancement={setEnhancement}
              />
            )}

            {activeTab === 'overlay' && (
              <OverlayPanel
                logoOverlay={logoOverlay}
                setLogoOverlay={setLogoOverlay}
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
                onAddLogoMedia={handleSetLogoOverlay}
              />
            )}

            {activeTab === 'speed' && (
              <SpeedPanel
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
                videoRef={videoRef}
              />
            )}

            {activeTab === 'audio' && (
              <AudioPanel
                muteOriginal={muteOriginal}
                setMuteOriginal={setMuteOriginal}
                originalVolume={originalVolume}
                setOriginalVolume={setOriginalVolume}
                audioFadeIn={audioFadeIn}
                setAudioFadeIn={setAudioFadeIn}
                audioFadeOut={audioFadeOut}
                setAudioFadeOut={setAudioFadeOut}
                audioTrack={audioTrack}
                setAudioTrack={setAudioTrack}
                audioClips={audioClips}
                setAudioClips={setAudioClips}
                selectedAudioClipId={selectedAudioClipId}
                setSelectedAudioClipId={setSelectedAudioClipId}
                currentTime={currentTime}
                audioVolume={audioVolume}
                setAudioVolume={setAudioVolume}
                audioLoop={audioLoop}
                setAudioLoop={setAudioLoop}
                videoPath={videoPath}
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
              />
            )}

            {activeTab === 'enhance' && (
              <EnhancePanel
                enhancement={enhancement}
                setEnhancement={setEnhancement}
                verticalAspect={verticalAspect}
                setVerticalAspect={setVerticalAspect}
                videoPath={videoPath}
                currentTime={currentTime}
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
              />
            )}

            {activeTab === 'subtitles' && (
              <SubtitlesPanel
                subtitles={subtitles}
                setSubtitles={setSubtitles}
                subtitleStyle={subtitleStyle}
                setSubtitleStyle={setSubtitleStyle}
                videoPath={videoPath}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                videoRef={videoRef}
              />
            )}

            {activeTab === 'transitions' && (
              <TransitionsPanel
                transitions={transitions}
                setTransitions={setTransitions}
                duration={duration}
                clips={clips}
                setClips={setClips}
                selectedClipId={selectedClipId}
                setCurrentTime={setCurrentTime}
                videoRef={videoRef}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Timeline with Smooth Scrubbing & Dynamic Multi-Layer Tracks */}
      <Timeline
        duration={duration}
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        clips={clips}
        setClips={setClips}
        selectedClipId={selectedClipId}
        setSelectedClipId={setSelectedClipId}
        tracks={tracks}
        setTracks={setTracks}
        subtitles={subtitles}
        silences={silences}
        videoRef={videoRef}
        audioTrack={audioTrack}
        setAudioTrack={setAudioTrack}
        audioClips={audioClips}
        setAudioClips={setAudioClips}
        selectedAudioClipId={selectedAudioClipId}
        setSelectedAudioClipId={setSelectedAudioClipId}
        setActiveTab={setActiveTab}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        pushHistorySnapshot={pushHistorySnapshot}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onStartRender={startRender}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderedResult={renderedResult}
        systemInfo={systemInfo}
      />

      {/* Project Save / Open / Recovery Modal */}
      <ProjectModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        currentProjectName={projectName}
        currentProjectId={projectId}
        hasVideo={!!videoUrl || clips.length > 0}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onNewProject={handleNewProject}
      />

      {/* Video Import & Hardware Transcode Progress Overlay */}
      {importProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                {importProgress.stage === 'transcoding' ? (
                  <Cpu className="w-6 h-6 animate-pulse" />
                ) : (
                  <Loader2 className="w-6 h-6 animate-spin" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white">
                  {importProgress.stage === 'transcoding'
                    ? 'Decodificando Vídeo pelo Hardware...'
                    : importProgress.stage === 'probing'
                      ? 'Analisando Codec & Formato...'
                      : 'Importando Vídeo...'}
                </h3>
                <p className="text-xs text-slate-400 truncate mt-0.5" title={importProgress.fileName}>
                  {importProgress.fileName}
                </p>
              </div>
              <span className="text-sm font-bold text-indigo-400 tabular-nums shrink-0">
                {importProgress.percent || 0}%
              </span>
            </div>

            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(4, importProgress.percent || 0)}%` }}
              />
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 space-y-1">
              <p className="text-xs font-medium text-slate-200">
                {importProgress.message || 'Preparando arquivo para reprodução no editor...'}
              </p>
              <p className="text-[11px] text-slate-400">
                {importProgress.stage === 'transcoding'
                  ? 'Este vídeo usa um codec não nativo do navegador. Estamos convertendo via aceleração de hardware para garantir reprodução fluida na timeline.'
                  : 'Aguarde um instante — o vídeo abrirá no player automaticamente.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
