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
  Image as ImageIcon
} from 'lucide-react';

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

export default function App() {
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

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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

  // Load existing media on start
  useEffect(() => {
    fetch('/api/media')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.media) {
          setMediaList(data.media);
        }
      })
      .catch(err => console.error('Erro ao listar mídias:', err));
  }, []);

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setVideoFile(file);
        setVideoUrl(data.url);
        setVideoPath(data.path);
        setVideoInfo(data.info);
        const dur = data.info?.duration || 0;
        setDuration(dur);

        // Add to media pool
        setMediaList(prev => [
          ...prev,
          {
            id: `media_${Date.now()}`,
            name: data.originalName,
            path: data.path,
            url: data.url,
            type: 'video',
            duration: dur,
            width: data.info?.width || 0,
            height: data.info?.height || 0
          }
        ]);

        setClips([
          {
            id: `clip_${Date.now()}`,
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
        setSelectedClipId(`clip_${Date.now()}`);
        setCurrentTime(0);
        setSubtitles([]);
        setSilences([]);
      } else {
        alert('Erro no envio do arquivo: ' + (data.error || 'Desconhecido'));
      }
    } catch (err) {
      alert('Erro de conexão ao enviar vídeo: ' + err.message);
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

  const handleSetBackgroundLayer = (mediaItem) => {
    if (!mediaItem) {
      setBackgroundLayer(null);
      return;
    }
    setBackgroundLayer({
      path: mediaItem.path,
      url: mediaItem.url,
      name: mediaItem.name,
      type: mediaItem.type
    });
    setActiveTab('transform');
  };

  const handleSetAudioTrack = (mediaItem) => {
    setAudioTrack({
      name: mediaItem.name,
      path: mediaItem.path,
      url: mediaItem.url,
      duration: mediaItem.duration
    });
  };

  const handleSetLogoOverlay = (mediaItem) => {
    setLogoOverlay({
      enabled: true,
      path: mediaItem.path,
      url: mediaItem.url,
      name: mediaItem.name,
      position: 'top-right',
      scale: 15,
      opacity: 100
    });
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
              alert('Erro na renderização: ' + data.error);
            }
          }
        }
      }
    } catch (err) {
      setIsRendering(false);
      alert('Erro ao comunicar com o servidor de renderização: ' + err.message);
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
      />
    </div>
  );
}
