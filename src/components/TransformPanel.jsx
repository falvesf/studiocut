import React from 'react';
import { ZoomIn, Move, RotateCcw, Maximize, Sparkles, Zap, Crosshair, Check, Eye } from 'lucide-react';

export default function TransformPanel({
  clips,
  setClips,
  selectedClipId,
  videoInfo,
  targetAspect = 'auto',
  enhancement = 'none',
  setEnhancement = () => {}
}) {
  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const selectedClip = clips[selectedClipIndex] || clips[0];

  const currentScale = selectedClip?.scale !== undefined ? selectedClip.scale : 100;
  const currentPosX = selectedClip?.posX !== undefined ? selectedClip.posX : 0;
  const currentPosY = selectedClip?.posY !== undefined ? selectedClip.posY : 0;
  const currentEnhancement = selectedClip?.enhancement || enhancement || 'none';

  const updateSelectedClip = (fields) => {
    if (!selectedClip) return;
    setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, ...fields } : c));
  };

  const handleReset = () => {
    updateSelectedClip({ scale: 100, posX: 0, posY: 0 });
  };

  const handleCenter = () => {
    updateSelectedClip({ posX: 0, posY: 0 });
  };

  // Calculate the exact cover scale needed to eliminate black bars based on aspect ratio
  const getCoverScale = () => {
    const vW = videoInfo?.width || 1920;
    const vH = videoInfo?.height || 1080;
    const vAspect = vW / vH;

    let cAspect = vAspect;
    if (targetAspect === '9:16') cAspect = 9 / 16;
    else if (targetAspect === '16:9') cAspect = 16 / 9;
    else if (targetAspect === '1:1') cAspect = 1.0;
    else if (targetAspect === '4:5') cAspect = 4 / 5;

    let factor = 1.0;
    if (vAspect > cAspect) {
      factor = vAspect / cAspect;
    } else if (vAspect < cAspect) {
      factor = cAspect / vAspect;
    }
    return Math.ceil(factor * 100);
  };

  const coverScale = getCoverScale();

  const handleApplyCover = () => {
    updateSelectedClip({ scale: coverScale, posX: 0, posY: 0 });
  };

  const handleEnhanceSelect = (presetId) => {
    updateSelectedClip({ enhancement: presetId });
    setEnhancement(presetId);
  };

  return (
    <div className="space-y-4 text-xs select-none">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <ZoomIn className="w-4 h-4 text-indigo-400" />
          Transformar: Escala & Zoom
        </h3>
        <p className="text-slate-400 text-[11px]">
          Aumente a escala do vídeo até 800% e enquadre o trecho com precisão sem bordas pretas (estilo CapCut).
        </p>
      </div>

      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200">
            Trecho {selectedClipIndex + 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCenter}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition cursor-pointer"
              title="Centralizar posição X e Y em 0%"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Centralizar</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
              title="Resetar escala e posição"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resetar</span>
            </button>
          </div>
        </div>

        {/* Smart 1-Click Cover Button (Elimina Bordas Pretas) */}
        {coverScale > 105 && (
          <button
            type="button"
            onClick={handleApplyCover}
            className={`w-full py-2 px-3 rounded-lg border font-bold text-xs transition cursor-pointer flex items-center justify-between shadow-md ${
              currentScale === coverScale
                ? 'bg-gradient-to-r from-emerald-600 to-indigo-600 border-emerald-400 text-white shadow-emerald-900/30'
                : 'bg-gradient-to-r from-indigo-900/80 to-purple-900/80 hover:from-indigo-800 hover:to-purple-800 border-indigo-500/40 text-cyan-200'
            }`}
            title={`Ajusta a escala automaticamente para ${coverScale}% para preencher toda a tela ${targetAspect} sem cortar topo ou base com barras pretas.`}
          >
            <div className="flex items-center gap-2">
              <Maximize className="w-4 h-4 text-cyan-300" />
              <span>Preencher Proporção {targetAspect === 'auto' ? '' : targetAspect} (Sem Barras Pretas)</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-black/40 text-[11px] font-mono text-emerald-300">
              {coverScale}%
            </span>
          </button>
        )}

        {/* Scale (Zoom) Slider & Direct Number Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
            <span className="flex items-center gap-1.5">
              <Maximize className="w-3.5 h-3.5 text-indigo-400" />
              Escala (Zoom)
            </span>
            <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              <input
                type="number"
                min="20"
                max="800"
                value={currentScale}
                onChange={(e) => updateSelectedClip({ scale: Math.max(20, Math.min(800, parseInt(e.target.value) || 100)) })}
                className="w-12 bg-transparent text-right font-mono text-indigo-300 font-bold focus:outline-none"
              />
              <span className="font-mono text-indigo-400 font-bold">%</span>
            </div>
          </div>

          <input
            type="range"
            min="20"
            max="800"
            step="1"
            value={currentScale}
            onChange={(e) => updateSelectedClip({ scale: parseInt(e.target.value) })}
            className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg accent-indigo-500 hover:accent-cyan-400 transition"
          />

          {/* Quick Scale Preset Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: '100% (Normal)', val: 100 },
              ...(coverScale > 105 ? [{ label: `Preencher (${coverScale}%)`, val: coverScale }] : []),
              { label: '150%', val: 150 },
              { label: '200% (2x)', val: 200 },
              { label: '300% (3x)', val: 300 },
              { label: '500% (5x)', val: 500 }
            ].map(p => (
              <button
                key={p.val}
                type="button"
                onClick={() => updateSelectedClip({ scale: p.val })}
                className={`px-2 py-1 rounded text-[10px] font-mono transition cursor-pointer border ${
                  currentScale === p.val
                    ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-750'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position X */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <div className="flex justify-between text-slate-300 font-semibold text-[11px]">
            <span className="flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-cyan-400" />
              Posição Horizontal (X)
            </span>
            <span className="font-mono text-cyan-300 font-bold">{currentPosX}%</span>
          </div>

          <input
            type="range"
            min="-150"
            max="150"
            step="1"
            value={currentPosX}
            onChange={(e) => updateSelectedClip({ posX: parseInt(e.target.value) })}
            className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>-150% (Esquerda)</span>
            <button
              type="button"
              onClick={() => updateSelectedClip({ posX: 0 })}
              className="text-slate-400 hover:text-cyan-300 underline cursor-pointer"
            >
              0% (Centro)
            </button>
            <span>+150% (Direita)</span>
          </div>
        </div>

        {/* Position Y */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <div className="flex justify-between text-slate-300 font-semibold text-[11px]">
            <span className="flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-cyan-400 rotate-90" />
              Posição Vertical (Y)
            </span>
            <span className="font-mono text-cyan-300 font-bold">{currentPosY}%</span>
          </div>

          <input
            type="range"
            min="-150"
            max="150"
            step="1"
            value={currentPosY}
            onChange={(e) => updateSelectedClip({ posY: parseInt(e.target.value) })}
            className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>-150% (Cima)</span>
            <button
              type="button"
              onClick={() => updateSelectedClip({ posY: 0 })}
              className="text-slate-400 hover:text-cyan-300 underline cursor-pointer"
            >
              0% (Centro)
            </button>
            <span>+150% (Baixo)</span>
          </div>
        </div>
      </div>

      {/* Hardware Super-Nitidez & Anti-Pixelamento (RTX 4070 Acelerado) */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-3.5 rounded-xl border border-indigo-500/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-bold text-slate-200 text-xs">
              Super Nitidez & Anti-Pixelamento
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
            RTX 4070 NVENC
          </span>
        </div>

        <p className="text-slate-400 text-[11px] leading-relaxed">
          Ao aumentar a escala ou esticar o vídeo para 9:16, ative este filtro para reconstruir contornos e eliminar o aspecto borrado ou quadriculado.
        </p>

        <div className="grid grid-cols-1 gap-2 pt-1">
          {[
            {
              id: 'cas_rtx',
              title: '⚡ Super Nitidez CAS (Recomendado para Zoom)',
              desc: 'Contraste adaptativo inteligente (FidelityFX CAS). Destaca detalhes e contornos sem artefatos.'
            },
            {
              id: 'whatsapp_turbo',
              title: 'WhatsApp Turbo HD (Anti-Compressão)',
              desc: 'Filtro 3D Denoise + CAS + Calibração de contraste contra blocos de compressão.'
            },
            {
              id: 'super_1080p',
              title: 'Upscale Full HD (Lanczos Sinc)',
              desc: 'Interpolação de alta fidelidade com realce de nitidez.'
            },
            {
              id: 'none',
              title: 'Original (Sem Filtro)',
              desc: 'Renderização padrão da gravação.'
            }
          ].map(opt => {
            const isSelected = currentEnhancement === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => handleEnhanceSelect(opt.id)}
                className={`p-2 rounded-lg border transition cursor-pointer flex items-start gap-2.5 ${
                  isSelected
                    ? 'bg-indigo-950/80 border-cyan-400 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  isSelected ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-600'
                }`}>
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[11px] text-slate-200">
                    {opt.title}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    {opt.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
