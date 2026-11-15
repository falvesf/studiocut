import React, { useState } from 'react';
import { Layers, Sun, Moon, Sparkles, Check, ArrowRightLeft, Clock } from 'lucide-react';
import { useDialog } from './DialogProvider.jsx';
import { TRANSITIONS_CATALOG, TRANSITION_CATEGORIES } from '../utils/transitionsCatalog.js';

export default function TransitionsPanel({
  clips = [],
  setClips = () => {},
  selectedClipId = null,
  transitions = { fadeIn: 0, fadeOut: 0 },
  setTransitions = () => {},
  duration = 0,
  setCurrentTime = null,
  videoRef = null
}) {
  const { showAlert } = useDialog();
  const [activeCategory, setActiveCategory] = useState('all');

  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const resolvedIndex = selectedClipIndex >= 0 ? selectedClipIndex : 0;
  const selectedClip = clips[resolvedIndex];

  // Order clips on the same track (or overall timeline) to find the next clip for 80% max duration
  const sortedClips = [...clips].sort((a, b) => (a.timelineStart ?? a.start ?? 0) - (b.timelineStart ?? b.start ?? 0));
  const sortedIdx = sortedClips.findIndex(c => c.id === selectedClip?.id);
  const nextClip = sortedIdx >= 0 ? sortedClips[sortedIdx + 1] : null;
  const durA = selectedClip ? (selectedClip.end - selectedClip.start) / (selectedClip.speed || 1.0) : 5;
  const durB = nextClip ? (nextClip.end - nextClip.start) / (nextClip.speed || 1.0) : durA;
  const minPairDur = Math.max(0.25, Math.min(durA, durB));
  const maxTransitionDur = Math.max(0.2, +(minPairDur * 0.8).toFixed(1));

  const clipFadeIn = selectedClip?.fadeIn !== undefined ? selectedClip.fadeIn : (transitions?.fadeIn || 0);
  const clipFadeOut = selectedClip?.fadeOut !== undefined ? selectedClip.fadeOut : (transitions?.fadeOut || 0);
  const currentTransition = selectedClip?.transitionToNext || 'none';
  const currentTransitionDur = Math.min(maxTransitionDur, selectedClip?.transitionDuration ?? Math.min(0.5, maxTransitionDur));

  const updateClipFade = (fields) => {
    if (selectedClip) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, ...fields } : c));
    }
  };

  const triggerTransitionPreview = (trDur) => {
    if (!selectedClip || !nextClip || !setCurrentTime) return;
    const clipStart = selectedClip.timelineStart !== undefined ? selectedClip.timelineStart : selectedClip.start;
    const cutPoint = clipStart + durA;
    const previewStart = Math.max(clipStart, cutPoint - Math.max(1.2, trDur * 0.65));
    setCurrentTime(previewStart);
    if (videoRef?.current) {
      setTimeout(() => {
        try {
          videoRef.current?.play?.();
        } catch (e) {}
      }, 60);
    }
  };

  const applyTransitionToSelected = (trId) => {
    if (!selectedClip) return;
    const nextDur = Math.min(maxTransitionDur, selectedClip.transitionDuration ?? currentTransitionDur);
    setClips(prev => prev.map(c => c.id === selectedClip.id ? {
      ...c,
      transitionToNext: trId,
      transitionDuration: nextDur
    } : c));
    if (trId !== 'none') {
      triggerTransitionPreview(nextDur);
    }
  };

  const applyTransitionDuration = (durVal) => {
    const parsed = Math.min(maxTransitionDur, Math.max(0.2, parseFloat(durVal)));
    if (!selectedClip) return;
    setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, transitionDuration: parsed } : c));
  };

  const applyTransitionToAllCuts = () => {
    if (clips.length < 2) {
      showAlert('Divida o vídeo em pelo menos 2 trechos para aplicar transições entre cortes.');
      return;
    }
    setClips(prev => prev.map((c, idx) => (
      idx < prev.length - 1
        ? { ...c, transitionToNext: currentTransition, transitionDuration: currentTransitionDur }
        : c
    )));
    showAlert(`Transição "${TRANSITIONS_CATALOG.find(t => t.id === currentTransition)?.name || currentTransition}" aplicada em todos os cortes!`);
  };

  const applyToAllClips = () => {
    setClips(prev => prev.map(c => ({
      ...c,
      fadeIn: clipFadeIn,
      fadeOut: clipFadeOut
    })));
    setTransitions({ fadeIn: clipFadeIn, fadeOut: clipFadeOut });
    showAlert('Efeito de Fade aplicado a todos os trechos do projeto!');
  };

  const filteredTransitions = activeCategory === 'all'
    ? TRANSITIONS_CATALOG
    : TRANSITIONS_CATALOG.filter(t => t.category === activeCategory);

  return (
    <div className="space-y-5 text-xs">
      {/* CapCut-style Cut Transitions Gallery */}
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-0.5">
            <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
            Transições entre Trechos ({TRANSITIONS_CATALOG.length - 1} Efeitos)
          </h3>
          <p className="text-slate-400 text-[11px]">
            Aplica na passagem do <strong className="text-slate-200">Trecho {selectedClipIndex >= 0 ? selectedClipIndex + 1 : 1}</strong> para o próximo corte.
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1">
          {TRANSITION_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Visual Grid of Transitions */}
        <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
          {filteredTransitions.map((tr) => {
            const isSelected = currentTransition === tr.id;
            return (
              <button
                key={tr.id}
                type="button"
                onClick={() => applyTransitionToSelected(tr.id)}
                className={`p-2 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-400 text-white shadow-md shadow-indigo-500/10'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-[11px] truncate">{tr.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </div>
                <span className="text-[9px] text-slate-400 truncate">{tr.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Transition Duration Slider (up to 80% of the shorter clip) */}
        {currentTransition !== 'none' && (
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Duração da Transição
              </span>
              <span className="font-mono text-cyan-300 font-bold">{currentTransitionDur.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0.2"
              max={maxTransitionDur}
              step="0.1"
              value={currentTransitionDur}
              onChange={(e) => applyTransitionDuration(e.target.value)}
              onMouseUp={() => triggerTransitionPreview(currentTransitionDur)}
              onTouchEnd={() => triggerTransitionPreview(currentTransitionDur)}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>0.2s (Rápida)</span>
              <span>Máx: {maxTransitionDur.toFixed(1)}s (80% do menor trecho)</span>
            </div>
          </div>
        )}

        {clips.length > 1 && (
          <button
            type="button"
            onClick={applyTransitionToAllCuts}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-indigo-600/80 text-slate-200 hover:text-white font-semibold border border-slate-700 hover:border-indigo-500 flex items-center justify-center gap-1.5 transition cursor-pointer text-[11px]"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Aplicar esta Transição em Todos os Cortes
          </button>
        )}
      </div>

      <div className="border-t border-slate-800/80 pt-4 space-y-3">
        <div>
          <h4 className="font-bold text-slate-300 text-xs flex items-center gap-1.5 mb-0.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Fade In / Fade Out do Trecho
          </h4>
        </div>

        {/* Fade In */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-[11px]">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              Fade In Inicial
            </span>
            <span className="font-mono text-indigo-300 font-bold">{clipFadeIn.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="0.5"
            value={clipFadeIn}
            onChange={(e) => updateClipFade({ fadeIn: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Fade Out */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-[11px]">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              Fade Out Final
            </span>
            <span className="font-mono text-indigo-300 font-bold">{clipFadeOut.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="0.5"
            value={clipFadeOut}
            onChange={(e) => updateClipFade({ fadeOut: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {clips.length > 1 && (
          <button
            type="button"
            onClick={applyToAllClips}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer text-[11px]"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            Aplicar este Fade em Todos os Trechos
          </button>
        )}
      </div>
    </div>
  );
}
