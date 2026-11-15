import React from 'react';
import { Layers, Sun, Moon, Sparkles, Check } from 'lucide-react';

export default function TransitionsPanel({
  clips = [],
  setClips = () => {},
  selectedClipId = null,
  transitions = { fadeIn: 0, fadeOut: 0 },
  setTransitions = () => {},
  duration = 0
}) {
  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const selectedClip = clips[selectedClipIndex] || clips[0];

  const clipFadeIn = selectedClip?.fadeIn !== undefined ? selectedClip.fadeIn : (transitions?.fadeIn || 0);
  const clipFadeOut = selectedClip?.fadeOut !== undefined ? selectedClip.fadeOut : (transitions?.fadeOut || 0);

  const updateClipFade = (fields) => {
    if (selectedClip) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, ...fields } : c));
    }
  };

  const applyToAllClips = () => {
    setClips(prev => prev.map(c => ({
      ...c,
      fadeIn: clipFadeIn,
      fadeOut: clipFadeOut
    })));
    setTransitions({ fadeIn: clipFadeIn, fadeOut: clipFadeOut });
    alert('Efeito de Fade aplicado a todos os trechos do projeto!');
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-indigo-400" />
          Transições & Efeito Fade
        </h3>
        <p className="text-slate-400 text-[11px]">
          Aplique escurecimento/clareamento suave (fade-in / fade-out) de forma independente no trecho selecionado.
        </p>
      </div>

      {/* Selected Clip Indicator */}
      {selectedClip && (
        <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="font-bold text-slate-200">
              Editando: {selectedClip.videoName ? selectedClip.videoName.slice(0, 20) : `Trecho ${selectedClipIndex + 1}`}
            </span>
          </div>
          <span className="text-[10px] font-mono text-cyan-300">
            Duração: {((selectedClip.end - selectedClip.start) / (selectedClip.speed || 1.0)).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Fade In */}
      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200">Fade In Inicial (Preto para Vídeo)</span>
          </div>
          <span className="font-mono text-indigo-300 font-bold">{clipFadeIn.toFixed(1)}s</span>
        </div>

        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={clipFadeIn}
          onChange={(e) => updateClipFade({ fadeIn: parseFloat(e.target.value) })}
          className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />

        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>0s (Desativado)</span>
          <span>0.5s</span>
          <span>1.0s (Padrão)</span>
          <span>3.0s</span>
        </div>
        <p className="text-[10px] text-slate-400">
          Apenas este trecho iniciará clareando suavemente a partir do preto.
        </p>
      </div>

      {/* Fade Out */}
      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-slate-200">Fade Out Final (Vídeo para Preto)</span>
          </div>
          <span className="font-mono text-indigo-300 font-bold">{clipFadeOut.toFixed(1)}s</span>
        </div>

        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={clipFadeOut}
          onChange={(e) => updateClipFade({ fadeOut: parseFloat(e.target.value) })}
          className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />

        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>0s (Desativado)</span>
          <span>0.5s</span>
          <span>1.0s (Padrão)</span>
          <span>3.0s</span>
        </div>
        <p className="text-[10px] text-slate-400">
          Apenas este trecho terminará escurecendo gradualmente para o preto.
        </p>
      </div>

      {/* Apply to all button */}
      <button
        type="button"
        onClick={applyToAllClips}
        className="w-full py-2 px-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        <span>Aplicar este Fade em Todos os Trechos</span>
      </button>
    </div>
  );
}
