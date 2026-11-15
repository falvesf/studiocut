import React, { useState } from 'react';
import { Scissors, VolumeX, Sparkles, Check, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useDialog } from './DialogProvider.jsx';

export default function TrimPanel({
  clips,
  setClips,
  selectedClipId,
  setSelectedClipId,
  duration,
  currentTime,
  videoPath,
  silences,
  setSilences,
  setCurrentTime,
  videoRef
}) {
  const { showAlert } = useDialog();
  const [isDetecting, setIsDetecting] = useState(false);

  const selectedClip = clips.find(c => c.id === selectedClipId) || clips[0];

  const handleStartChange = (val) => {
    if (!selectedClip) return;
    const num = Math.max(0, Math.min(parseFloat(val) || 0, selectedClip.end - 0.1));
    const shift = (num - selectedClip.start) / (selectedClip.speed || 1.0);
    setClips(prev => prev.map(c => c.id === selectedClip.id ? {
      ...c,
      start: num,
      timelineStart: Math.max(0, (c.timelineStart ?? 0) + shift)
    } : c));
  };

  const handleEndChange = (val) => {
    if (!selectedClip) return;
    const num = Math.min(duration, Math.max(selectedClip.start + 0.1, parseFloat(val) || duration));
    setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, end: num } : c));
  };

  const splitCurrent = () => {
    if (duration <= 0 || clips.length === 0) return;

    // Find the clip under currentTime on the timeline (preferring selectedClip if under cursor)
    const target = (selectedClip && currentTime >= (selectedClip.timelineStart ?? 0) && currentTime <= (selectedClip.timelineStart ?? 0) + (selectedClip.end - selectedClip.start) / (selectedClip.speed || 1.0))
      ? selectedClip
      : clips.find(c => {
          const s = c.timelineStart !== undefined ? c.timelineStart : c.start;
          const dur = (c.end - c.start) / (c.speed || 1.0);
          return currentTime > s + 0.1 && currentTime < s + dur - 0.1;
        });

    if (!target) {
      showAlert('Posicione a agulha de reprodução dentro de um trecho para poder cortar com a tesoura.');
      return;
    }

    const tStart = target.timelineStart !== undefined ? target.timelineStart : target.start;
    const splitOffset = (currentTime - tStart) * (target.speed || 1.0);
    const splitSourceTime = target.start + splitOffset;

    if (splitSourceTime <= target.start + 0.05 || splitSourceTime >= target.end - 0.05) return;

    const firstPart = {
      ...target,
      end: splitSourceTime,
      timelineStart: tStart,
      transitionToNext: 'none'
    };

    const secondPart = {
      ...target,
      id: `clip_${Date.now()}`,
      start: splitSourceTime,
      timelineStart: currentTime,
      transitionToNext: target.transitionToNext || 'none'
    };

    const targetIdx = clips.findIndex(c => c.id === target.id);
    const newClips = [...clips];
    newClips.splice(targetIdx, 1, firstPart, secondPart);
    setClips(newClips);
    setSelectedClipId(secondPart.id);
  };

  const deleteCurrentClip = () => {
    if (clips.length <= 1) {
      showAlert('Você precisa manter pelo menos 1 trecho no vídeo.');
      return;
    }
    const newClips = clips.filter(c => c.id !== selectedClip.id);
    setClips(newClips);
    setSelectedClipId(newClips[0].id);
  };

  const detectSilences = async () => {
    if (!videoPath) return;
    setIsDetecting(true);
    try {
      const res = await fetch('/api/silences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: videoPath, noiseDb: -30, minDuration: 0.6 })
      });
      const data = await res.json();
      if (data.silences) {
        setSilences(data.silences);
      }
    } catch (err) {
      showAlert('Erro ao detectar silêncios: ' + err.message);
    } finally {
      setIsDetecting(false);
    }
  };

  // 1-Click Auto-Cut all detected silences
  const autoCutAllSilences = () => {
    if (silences.length === 0 || duration <= 0) return;

    // Build speech intervals between silences
    const speechClips = [];
    let currentStart = 0;

    silences.forEach((s) => {
      if (s.start > currentStart + 0.2) {
        speechClips.push({
          id: `speech_${Date.now()}_${speechClips.length}`,
          start: currentStart,
          end: s.start,
          transitionToNext: 'none'
        });
      }
      currentStart = s.end;
    });

    if (currentStart < duration - 0.2) {
      speechClips.push({
        id: `speech_${Date.now()}_${speechClips.length}`,
        start: currentStart,
        end: duration,
        transitionToNext: 'none'
      });
    }

    if (speechClips.length > 0) {
      setClips(speechClips);
      setSelectedClipId(speechClips[0].id);
      showAlert(`Auto-Cut aplicado com sucesso! ${silences.length} pausa(s) foram removidas e o vídeo foi dividido em ${speechClips.length} trechos dinâmicos.`);
    }
  };

  const jumpTo = (time) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Scissors className="w-4 h-4 text-indigo-400" />
          Corte & Divisão com a Tesoura
        </h3>
        <p className="text-slate-400 text-[11px]">
          Divida o vídeo em partes com a tesoura, remova os pedaços que não quiser e ajuste os trechos restantes.
        </p>
      </div>

      {/* Big Action: Scissors Split */}
      <button
        onClick={splitCurrent}
        className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
      >
        <Scissors className="w-4 h-4 text-cyan-200" />
        <span>Dividir Trecho no Cursor [S]</span>
      </button>

      {/* Selected Clip Adjustments */}
      {selectedClip && (
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200">
              Trecho Selecionado ({((selectedClip.end - selectedClip.start) || 0).toFixed(1)}s)
            </span>

            {clips.length > 1 && (
              <button
                onClick={deleteCurrentClip}
                className="flex items-center gap-1 px-2 py-1 rounded bg-rose-950/60 text-rose-300 hover:bg-rose-900 border border-rose-500/40 text-[11px] font-semibold cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Excluir</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Início (segundos)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration}
                value={Number((selectedClip.start || 0).toFixed(1))}
                onChange={(e) => handleStartChange(e.target.value)}
                className="w-full bg-slate-800 text-white font-mono px-2.5 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Fim (segundos)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration}
                value={Number((selectedClip.end || duration).toFixed(1))}
                onChange={(e) => handleEndChange(e.target.value)}
                className="w-full bg-slate-800 text-white font-mono px-2.5 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Auto-Silence detection (Auto-Cut) */}
      <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-indigo-300">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Detector de Silêncios & Pausas</span>
          </div>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold uppercase">
            Auto-Cut
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Encontra trechos mortos na fala para você eliminar com 1 clique.
        </p>

        <button
          onClick={detectSilences}
          disabled={isDetecting || !videoPath}
          className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold transition flex items-center justify-center gap-2 cursor-pointer"
        >
          {isDetecting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analisando Áudio...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Detectar Pausas no Vídeo</span>
            </>
          )}
        </button>

        {silences.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
              <span>{silences.length} pausa(s) encontrada(s)</span>
            </div>

            <button
              onClick={autoCutAllSilences}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Eliminar Todas as Pausas com 1 Clique</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
