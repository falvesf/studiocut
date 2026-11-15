import React, { useState } from 'react';
import {
  X,
  Download,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  Sparkles,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

export default function ExportModal({
  isOpen,
  onClose,
  onStartRender,
  isRendering,
  renderProgress,
  renderedResult
}) {
  const [resolution, setResolution] = useState('original');
  const [useNvenc, setUseNvenc] = useState(true);

  if (!isOpen) return null;

  const resolutions = [
    { id: 'original', name: 'Original', desc: 'Mantém as dimensões originais' },
    { id: '1080p', name: '1080p Full HD', desc: '1920x1080 (Padrão ouro para web)' },
    { id: '720p', name: '720p HD', desc: '1280x720 (Mais leve para WhatsApp)' },
    { id: '4k', name: '4K Ultra HD', desc: '3840x2160 (Máxima fidelidade)' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#141824] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Exportação de Vídeo</h2>
              <p className="text-xs text-slate-400">Sem marca d'água • Aceleração por Hardware</p>
            </div>
          </div>

          {!isRendering && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* While Rendering */}
          {isRendering ? (
            <div className="py-6 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <RefreshCw className="w-16 h-16 text-indigo-500 animate-spin opacity-80" />
                <span className="absolute font-mono font-extrabold text-sm text-white">
                  {renderProgress.percent}%
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">Renderizando com RTX 4070...</h3>
                <p className="text-slate-400 text-[11px] mt-1">
                  Aplicando filtros, cortes, legendas e codificação NVENC em alta velocidade.
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/60">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${renderProgress.percent}%` }}
                />
              </div>
            </div>
          ) : renderedResult ? (
            /* When Finished */
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-emerald-300">Vídeo Renderizado com Sucesso!</h3>
                  <p className="text-slate-400 text-[11px]">
                    Seu arquivo foi gerado sem nenhuma marca d'água e em alta resolução.
                  </p>
                </div>
              </div>

              {/* Finished Video Preview */}
              <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 shadow">
                <video
                  src={renderedResult.url}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <a
                  href={renderedResult.url}
                  download={renderedResult.filename}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Vídeo Final (MP4)</span>
                </a>

                <button
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer border border-slate-700"
                >
                  Voltar ao Editor
                </button>
              </div>
            </div>
          ) : (
            /* Configure Settings Before Export */
            <div className="space-y-4">
              {/* Resolution options */}
              <div>
                <label className="block font-bold text-slate-300 mb-2">
                  Resolução de Saída:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {resolutions.map(r => (
                    <div
                      key={r.id}
                      onClick={() => setResolution(r.id)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer ${
                        resolution === r.id
                          ? 'bg-indigo-950/40 border-indigo-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-slate-200">{r.name}</div>
                      <div className="text-[10px] text-slate-500">{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hardware Acceleration info */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-200">Aceleração NVIDIA NVENC</div>
                    <div className="text-[10px] text-slate-400">
                      Usa o chip dedicado da RTX 4070 para renderização ultra veloz
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={useNvenc}
                  onChange={(e) => setUseNvenc(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer h-4 w-4"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={() => onStartRender({ resolution, useNvenc })}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>Iniciar Renderização Gratuita</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

