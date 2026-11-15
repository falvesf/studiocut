import React, { useRef, useState } from 'react';
import { Volume2, VolumeX, Music, Upload, Trash2, Repeat, Scissors, Sparkles, RefreshCw, Gauge } from 'lucide-react';
import { useDialog } from './DialogProvider.jsx';

export default function AudioPanel({
  muteOriginal,
  setMuteOriginal,
  originalVolume,
  setOriginalVolume,
  audioFadeIn = 0,
  setAudioFadeIn = () => {},
  audioFadeOut = 0,
  setAudioFadeOut = () => {},
  audioTrack,
  setAudioTrack,
  audioClips = [],
  setAudioClips = () => {},
  selectedAudioClipId = null,
  setSelectedAudioClipId = () => {},
  currentTime = 0,
  audioVolume,
  setAudioVolume,
  audioLoop,
  setAudioLoop,
  videoPath,
  clips = [],
  setClips = () => {},
  selectedClipId = null
}) {
  const fileInputRef = useRef(null);
  const { showAlert } = useDialog();
  const [isExtracting, setIsExtracting] = useState(false);

  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const selectedClip = clips[selectedClipIndex] || clips[0];

  const clipVolume = selectedClip?.volume !== undefined ? selectedClip.volume : 1.0;
  const isClipMuted = selectedClip?.muted === true;
  const isAudioExtracted = selectedClip?.audioExtracted === true;

  const selectedAudioClip = audioClips.find(c => c.id === selectedAudioClipId) || audioClips[0] || null;

  const updateSelectedAudioClip = (fields) => {
    if (!selectedAudioClip) return;
    setAudioClips(prev => prev.map(ac => ac.id === selectedAudioClip.id ? { ...ac, ...fields } : ac));
  };

  const handleSplitAudioClip = () => {
    if (!selectedAudioClip) return;
    const acStart = selectedAudioClip.timelineStart || 0;
    const acSpeed = selectedAudioClip.speed || 1;
    const acDur = ((selectedAudioClip.end || selectedAudioClip.duration || 10) - (selectedAudioClip.start || 0)) / acSpeed;
    const acEnd = acStart + acDur;
    if (currentTime <= acStart + 0.1 || currentTime >= acEnd - 0.1) {
      showAlert('Posicione a agulha amarela dentro do trecho de áudio para dividir.');
      return;
    }
    const splitOffsetSource = (currentTime - acStart) * acSpeed;
    const splitPoint = (selectedAudioClip.start || 0) + splitOffsetSource;
    const firstPart = {
      ...selectedAudioClip,
      end: splitPoint
    };
    const secondPart = {
      ...selectedAudioClip,
      id: `aclip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      start: splitPoint,
      timelineStart: currentTime
    };
    setAudioClips(prev => {
      const idx = prev.findIndex(c => c.id === selectedAudioClip.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1, firstPart, secondPart);
      return next;
    });
    setSelectedAudioClipId(secondPart.id);
  };

  const handleDeleteAudioClip = (id) => {
    setAudioClips(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) {
        setAudioTrack(null);
        setSelectedAudioClipId(null);
      } else if (selectedAudioClipId === id) {
        setSelectedAudioClipId(next[0].id);
      }
      return next;
    });
  };

  const updateSelectedClip = (fields) => {
    if (selectedClip) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, ...fields } : c));
    }
  };

  const handleAudioUpload = async (e) => {
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
        setAudioTrack({
          name: data.originalName,
          path: data.path,
          url: data.url,
          duration: data.info?.duration || 0
        });
      }
    } catch (err) {
      showAlert('Erro ao enviar áudio: ' + err.message);
    }
  };

  // Extract audio from selected clip (or main video) into standalone track
  const handleExtractAudio = async () => {
    const targetPath = selectedClip?.videoPath || videoPath;
    if (!targetPath) return;
    setIsExtracting(true);

    try {
      const res = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: targetPath,
          startTime: selectedClip?.start ?? null,
          endTime: selectedClip?.end ?? null
        })
      });
      const data = await res.json();
      if (data.success) {
        const clipName = selectedClip?.videoName || 'Vídeo';
        const dur = data.duration || (selectedClip ? (selectedClip.end - selectedClip.start) : 0);
        const newAudioClip = {
          id: `aclip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `Áudio: ${clipName}`,
          path: data.path,
          url: data.url,
          duration: dur,
          start: 0,
          end: dur,
          timelineStart: selectedClip?.timelineStart ?? 0,
          volume: selectedClip?.volume !== undefined ? selectedClip.volume : 1.0,
          speed: selectedClip?.speed || 1.0,
          fadeIn: 0,
          fadeOut: 0,
          muted: false
        };
        setAudioClips(prev => [...prev, newAudioClip]);
        setSelectedAudioClipId(newAudioClip.id);
        if (selectedClip) {
          updateSelectedClip({ muted: true, audioExtracted: true });
        } else {
          setMuteOriginal(true);
        }
      } else {
        showAlert('Erro ao extrair áudio: ' + (data.error || 'Falha'));
      }
    } catch (err) {
      showAlert('Erro de conexão ao extrair áudio: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Volume2 className="w-4 h-4 text-indigo-400" />
          Gerenciamento de Áudio & Trilha
        </h3>
        <p className="text-slate-400 text-[11px]">
          Controle o volume e mudo de forma independente por trecho ou gerencie a trilha sonora.
        </p>
      </div>

      {/* Button: Extrair Áudio do Vídeo (CapCut Feature) */}
      {videoPath && (
        <div className="bg-indigo-950/30 border border-indigo-500/40 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Separar / Extrair Áudio</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Destaca o áudio do vídeo para uma faixa própria editável
            </p>
          </div>

          <button
            type="button"
            onClick={handleExtractAudio}
            disabled={isExtracting}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {isExtracting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Scissors className="w-3.5 h-3.5" />
            )}
            <span>Extrair Áudio</span>
          </button>
        </div>
      )}

      {/* Selected Clip Audio Independence */}
      {selectedClip && (
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-indigo-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-indigo-300 block">
                Áudio do Trecho {selectedClipIndex + 1}
              </span>
              <span className="text-[10px] text-slate-400">
                Ajustes exclusivos para este trecho selecionado
              </span>
            </div>

            <button
              type="button"
              onClick={() => updateSelectedClip({ muted: !isClipMuted, audioExtracted: false })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                isAudioExtracted
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : isClipMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              {isAudioExtracted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  <span>Áudio Extraído</span>
                </>
              ) : isClipMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  <span>Mutado</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Com Som</span>
                </>
              )}
            </button>
          </div>

          {!isClipMuted && (
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Volume deste Trecho</span>
                <span className="font-mono text-indigo-300 font-bold">{Math.round(clipVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={clipVolume}
                onChange={(e) => updateSelectedClip({ volume: parseFloat(e.target.value) })}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
          )}
        </div>
      )}

      {/* 2. Global Video Audio Setting */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-slate-400" />
            Mudo Geral do Vídeo
          </span>

          <button
            type="button"
            onClick={() => setMuteOriginal(!muteOriginal)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer border ${
              muteOriginal
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            {muteOriginal ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                <span>Vídeo Mutado</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vídeo com Som</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. Extra Sound Track / Independent Audio Clips */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200 flex items-center gap-2">
            <Music className="w-4 h-4 text-emerald-400" />
            Trilha Sonora / Áudio Extraído
          </span>

          {selectedAudioClip && (
            <button
              type="button"
              onClick={() => handleDeleteAudioClip(selectedAudioClip.id)}
              className="text-slate-400 hover:text-rose-400 p-1 rounded cursor-pointer flex items-center gap-1 text-[10px]"
              title="Remover trecho de áudio selecionado"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>
          )}
        </div>

        {selectedAudioClip ? (
          <div className="space-y-3 pt-1">
            {audioClips.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {audioClips.map((ac, i) => (
                  <button
                    key={ac.id}
                    type="button"
                    onClick={() => setSelectedAudioClipId(ac.id)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer transition ${
                      ac.id === selectedAudioClip.id
                        ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                        : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Faixa {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="p-2.5 bg-slate-950/80 rounded-lg border border-emerald-500/30 flex items-center justify-between gap-2">
              <div className="truncate pr-2">
                <span className="font-semibold text-slate-200 block truncate">{selectedAudioClip.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {(((selectedAudioClip.end || selectedAudioClip.duration || 0) - (selectedAudioClip.start || 0)) / (selectedAudioClip.speed || 1)).toFixed(1)}s
                  {' • '}Início {(selectedAudioClip.timelineStart || 0).toFixed(1)}s
                </span>
              </div>
              <button
                type="button"
                onClick={() => updateSelectedAudioClip({ muted: !selectedAudioClip.muted })}
                className={`px-2 py-1 rounded text-[10px] font-bold border cursor-pointer shrink-0 ${
                  selectedAudioClip.muted
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                {selectedAudioClip.muted ? 'Mutado' : 'Ativo'}
              </button>
            </div>

            {/* Volume do Áudio */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Volume do Trecho</span>
                <span className="font-mono text-emerald-400 font-bold">{Math.round((selectedAudioClip.volume ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={selectedAudioClip.volume ?? 1}
                onChange={(e) => updateSelectedAudioClip({ volume: parseFloat(e.target.value) })}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Velocidade do Áudio */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1"><Gauge className="w-3 h-3 text-cyan-400" /> Velocidade</span>
                <span className="font-mono text-cyan-300 font-bold">{(selectedAudioClip.speed || 1).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={selectedAudioClip.speed || 1}
                onChange={(e) => updateSelectedAudioClip({ speed: parseFloat(e.target.value) })}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Fade In / Fade Out */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Fade In</span>
                  <span className="font-mono text-amber-300 font-bold">{(selectedAudioClip.fadeIn || 0).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={selectedAudioClip.fadeIn || 0}
                  onChange={(e) => updateSelectedAudioClip({ fadeIn: parseFloat(e.target.value) })}
                  className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Fade Out</span>
                  <span className="font-mono text-amber-300 font-bold">{(selectedAudioClip.fadeOut || 0).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={selectedAudioClip.fadeOut || 0}
                  onChange={(e) => updateSelectedAudioClip({ fadeOut: parseFloat(e.target.value) })}
                  className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
            </div>

            {/* Split Audio at Playhead */}
            <button
              type="button"
              onClick={handleSplitAudioClip}
              className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Cortar / Dividir Áudio na Agulha</span>
            </button>
          </div>
        ) : audioTrack ? (
          <div className="space-y-3 pt-1">
            <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
              <div className="truncate pr-2">
                <span className="font-semibold text-slate-200 block truncate">{audioTrack.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {audioTrack.duration ? `${audioTrack.duration.toFixed(1)}s` : 'Áudio carregado'}
                </span>
              </div>
            </div>

            {/* Volume Trilha */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Volume da Música</span>
                <span className="font-mono text-emerald-400 font-bold">{Math.round(audioVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={audioVolume}
                onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Loop Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-slate-400" />
                Repetir em loop
              </span>
              <input
                type="checkbox"
                checked={audioLoop}
                onChange={(e) => setAudioLoop(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        ) : null}

        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="hidden"
            onChange={handleAudioUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 rounded-lg border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-800/40 hover:bg-slate-800/80 text-slate-300 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-indigo-400" />
            <span>Importar Música ou Efeito Sonoro</span>
          </button>
        </div>
      </div>
    </div>
  );
}
