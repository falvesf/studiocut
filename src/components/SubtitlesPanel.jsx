import React, { useState } from 'react';
import {
  Subtitles,
  Sparkles,
  Plus,
  Trash2,
  Download,
  Palette,
  RefreshCw,
  Clock
} from 'lucide-react';

export default function SubtitlesPanel({
  subtitles,
  setSubtitles,
  subtitleStyle,
  setSubtitleStyle,
  videoPath,
  currentTime,
  setCurrentTime,
  videoRef
}) {
  const [isTranscribing, setIsTranscribing] = useState(false);

  const stylePresets = [
    { name: 'CapCut Amarelo', color: '#FACC15', assColor: '&H0015CCFA', outline: '#000000' },
    { name: 'Branco Clássico', color: '#FFFFFF', assColor: '&H00FFFFFF', outline: '#000000' },
    { name: 'Verde Neon', color: '#4ADE80', assColor: '&H0080DE4A', outline: '#000000' },
    { name: 'Ciano Vibrante', color: '#38BDF8', assColor: '&H00F8BD38', outline: '#000000' }
  ];

  const handleTranscribe = async () => {
    if (!videoPath) return;
    setIsTranscribing(true);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: videoPath, language: 'pt' })
      });
      const data = await res.json();
      if (data.success && data.subtitles) {
        setSubtitles(data.subtitles);
      } else {
        alert('Nenhuma legenda detectada ou erro na transcrição.');
      }
    } catch (err) {
      alert('Erro na transcrição Whisper: ' + err.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const addManualSubtitle = () => {
    const newSub = {
      id: Date.now(),
      start: currentTime,
      end: currentTime + 2.5,
      text: 'Nova Legenda...'
    };
    setSubtitles(prev => [...prev, newSub].sort((a, b) => a.start - b.start));
  };

  const updateSubText = (id, newText) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, text: newText } : s));
  };

  const updateSubTiming = (id, field, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, [field]: num } : s));
  };

  const deleteSub = (id) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  const jumpTo = (time) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const downloadSrt = async () => {
    if (subtitles.length === 0) return;
    try {
      const res = await fetch('/api/export-srt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles, filename: 'legendas_StudioCut.srt' })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'legendas_StudioCut.srt';
      a.click();
    } catch (err) {
      alert('Erro ao exportar SRT: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Subtitles className="w-4 h-4 text-indigo-400" />
          Legendas Inteligentes (Whisper AI)
        </h3>
        <p className="text-slate-400 text-[11px]">
          Gere legendas automáticas em português com IA ou crie e personalize manualmente.
        </p>
      </div>

      {/* AI Whisper Transcription Button */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-indigo-950/40 border border-indigo-500/40 p-3.5 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-indigo-300">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>Auto-Legendas (Whisper Local)</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold uppercase">
            Sem Custos / RTX 4070
          </span>
        </div>

        <button
          onClick={handleTranscribe}
          disabled={isTranscribing || !videoPath}
          className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
        >
          {isTranscribing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Transcrevendo com IA local...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-cyan-200" />
              <span>Gerar Legendas Automáticas</span>
            </>
          )}
        </button>
      </div>

      {/* Style & Visual Customizer */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-indigo-400" />
            Estilo Visual das Legendas
          </span>
        </div>

        {/* Color presets */}
        <div className="grid grid-cols-2 gap-2">
          {stylePresets.map((sp) => {
            const isSelected = (subtitleStyle.color || '#FACC15') === sp.color;
            return (
              <button
                key={sp.name}
                onClick={() => setSubtitleStyle(prev => ({
                  ...prev,
                  color: sp.color,
                  primaryColor: sp.assColor
                }))}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full border border-black shadow"
                  style={{ backgroundColor: sp.color }}
                />
                <span className="text-[11px] truncate">{sp.name}</span>
              </button>
            );
          })}
        </div>

        {/* Font size control */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-slate-400 text-[11px]">
            <span>Tamanho da Fonte</span>
            <span className="font-mono text-indigo-300 font-bold">{subtitleStyle.fontSize || 22}px</span>
          </div>
          <input
            type="range"
            min="16"
            max="36"
            step="1"
            value={subtitleStyle.fontSize || 22}
            onChange={(e) => setSubtitleStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
            className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>
      </div>

      {/* Subtitle List / Actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200">
            Linhas de Legenda ({subtitles.length})
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={addManualSubtitle}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
            </button>

            {subtitles.length > 0 && (
              <button
                onClick={downloadSrt}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition cursor-pointer"
                title="Baixar arquivo .srt"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.SRT</span>
              </button>
            )}
          </div>
        </div>

        {subtitles.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500">
            Nenhuma legenda adicionada. Clique em "Gerar Legendas Automáticas" ou adicione manualmente.
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {subtitles.map((sub) => (
              <div
                key={sub.id}
                className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/90 space-y-1.5 focus-within:border-indigo-500/70"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-indigo-400" />
                    <input
                      type="number"
                      step="0.1"
                      value={Number(sub.start.toFixed(1))}
                      onChange={(e) => updateSubTiming(sub.id, 'start', e.target.value)}
                      className="w-12 bg-slate-800 text-slate-200 px-1 py-0.5 rounded border border-slate-700 text-center"
                    />
                    <span>→</span>
                    <input
                      type="number"
                      step="0.1"
                      value={Number(sub.end.toFixed(1))}
                      onChange={(e) => updateSubTiming(sub.id, 'end', e.target.value)}
                      className="w-12 bg-slate-800 text-slate-200 px-1 py-0.5 rounded border border-slate-700 text-center"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => jumpTo(sub.start)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans cursor-pointer"
                      title="Ir para este momento no vídeo"
                    >
                      Ouvir
                    </button>
                    <button
                      onClick={() => deleteSub(sub.id)}
                      className="p-1 rounded hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <textarea
                  rows="2"
                  value={sub.text}
                  onChange={(e) => updateSubText(sub.id, e.target.value)}
                  className="w-full bg-slate-800/80 text-slate-100 font-medium px-2 py-1 rounded border border-slate-700 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

