import React, { useRef, useState } from 'react';
import { Volume2, VolumeX, Music, Upload, Trash2, Repeat, Scissors, Sparkles, RefreshCw, Layers } from 'lucide-react';
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
        setAudioTrack({
          name: `Áudio: ${clipName}`,
          path: data.path,
          url: data.url,
          duration: data.duration || (selectedClip ? (selectedClip.end - selectedClip.start) : 0),
          timelineStart: selectedClip?.timelineStart ?? 0
        });
        if (selectedClip) {
          updateSelectedClip({ muted: true });
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
              onClick={() => updateSelectedClip({ muted: !isClipMuted })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                isClipMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              {isClipMuted ? (
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

      {/* 3. Extra Sound Track (Música de Fundo / Playback) */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200 flex items-center gap-2">
            <Music className="w-4 h-4 text-indigo-400" />
            Trilha Sonora Independente
          </span>

          {audioTrack && (
            <button
              type="button"
              onClick={() => setAudioTrack(null)}
              className="text-slate-500 hover:text-rose-400 p-1 rounded cursor-pointer"
              title="Remover trilha"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {audioTrack ? (
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
        ) : (
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
        )}
      </div>
    </div>
  );
}
