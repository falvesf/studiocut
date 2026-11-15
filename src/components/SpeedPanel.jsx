import React from 'react';
import { Gauge, FastForward, Play, RotateCcw } from 'lucide-react';

export default function SpeedPanel({
  clips,
  setClips,
  selectedClipId,
  videoRef
}) {
  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const selectedClip = clips[selectedClipIndex] || clips[0];

  const currentSpeed = selectedClip?.speed || 1.0;
  const originalDuration = selectedClip ? (selectedClip.end - selectedClip.start) : 0;
  const newDuration = originalDuration / currentSpeed;

  const presets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

  const setSpeed = (val) => {
    const spd = Math.max(0.2, Math.min(4.0, parseFloat(val) || 1.0));
    if (selectedClip) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, speed: spd } : c));
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = spd;
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Gauge className="w-4 h-4 text-indigo-400" />
          Velocidade do Vídeo
        </h3>
        <p className="text-slate-400 text-[11px]">
          Aumente a velocidade para acelerar trechos longos ou diminua para criar câmera lenta (slow motion).
        </p>
      </div>

      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200">
            Trecho {selectedClipIndex + 1}
          </span>
          <button
            onClick={() => setSpeed(1.0)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
            title="Resetar para velocidade normal"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>1.0x (Normal)</span>
          </button>
        </div>

        {/* Speed Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-300 font-semibold text-[11px]">
            <span>Velocidade</span>
            <span className="font-mono text-indigo-300 font-bold text-sm">{currentSpeed.toFixed(2)}x</span>
          </div>

          <input
            type="range"
            min="0.2"
            max="4.0"
            step="0.05"
            value={currentSpeed}
            onChange={(e) => setSpeed(e.target.value)}
            className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />

          {/* Quick Preset Buttons */}
          <div className="grid grid-cols-4 gap-1.5 pt-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setSpeed(p)}
                className={`py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                  currentSpeed === p
                    ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p}x
              </button>
            ))}
          </div>
        </div>

        {/* Duration comparison */}
        <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Duração resultante:</span>
          <div className="font-mono">
            <span className="text-slate-500 line-through mr-1.5">{originalDuration.toFixed(1)}s</span>
            <span className="text-emerald-400 font-bold">{newDuration.toFixed(1)}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

