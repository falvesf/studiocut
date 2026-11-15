import React, { useState } from 'react';
import { Sparkles, Eye, Smartphone, Zap, CheckCircle2, Sliders, ShieldCheck, Play, RefreshCw, X, Layers, Film } from 'lucide-react';

export default function EnhancePanel({
  enhancement,
  setEnhancement,
  verticalAspect,
  setVerticalAspect,
  videoPath,
  currentTime,
  clips = [],
  setClips = () => {},
  selectedClipId = null
}) {
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [applyScope, setApplyScope] = useState('selected'); // 'selected' | 'all'

  const selectedClipIndex = clips.findIndex(c => c.id === selectedClipId);
  const selectedClip = clips[selectedClipIndex] || clips[0];

  const presets = [
    {
      id: 'cas_rtx',
      title: '⚡ Super Nitidez RTX (CAS Adaptativo)',
      badge: 'Recomendado para Zoom',
      desc: 'Tecnologia AMD/NVIDIA FidelityFX CAS: reconstrói contornos, elimina borrões e evita pixelamento ao dar zoom.',
      icon: Sparkles,
      gradient: 'from-cyan-500/20 to-blue-500/20',
      border: 'border-cyan-500/40 text-cyan-300'
    },
    {
      id: 'whatsapp_turbo',
      title: 'WhatsApp Turbo (Recomendado)',
      badge: 'Mais Popular',
      desc: 'Remove ruído e blocos de compressão, realça nitidez de bordas e calibra saturação e contraste.',
      icon: Zap,
      gradient: 'from-emerald-500/20 to-indigo-500/20',
      border: 'border-emerald-500/40 text-emerald-300'
    },
    {
      id: 'super_1080p',
      title: 'Upscaling para Full HD 1080p',
      badge: 'Alta Definição',
      desc: 'Redimensiona usando o algoritmo Lanczos de alta fidelidade com reforço de contornos.',
      icon: Sparkles,
      gradient: 'from-indigo-500/20 to-cyan-500/20',
      border: 'border-indigo-500/40 text-indigo-300'
    },
    {
      id: 'sharpen',
      title: 'Super Nitidez (Unsharp Mask)',
      badge: 'Foco Nítido',
      desc: 'Recupera foco e nitidez em textos e rostos que ficaram embaçados ou borrados.',
      icon: Eye,
      gradient: 'from-amber-500/20 to-orange-500/20',
      border: 'border-amber-500/40 text-amber-300'
    },
    {
      id: 'denoise',
      title: 'Limpeza de Granulação (Denoise)',
      badge: 'Suavização',
      desc: 'Suaviza granulação escura e artefatos de vídeo gravado em baixa luminosidade.',
      icon: ShieldCheck,
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/40 text-purple-300'
    },
    {
      id: 'none',
      title: 'Sem Melhoria (Original)',
      desc: 'Mantém a imagem exatamente como foi gravada, sem filtros adicionais.',
      icon: Sliders,
      gradient: 'from-slate-800 to-slate-900',
      border: 'border-slate-700 text-slate-400'
    }
  ];

  // Determine which enhancement is currently active based on scope
  const currentActive = applyScope === 'selected'
    ? (selectedClip?.enhancement || 'none')
    : enhancement;

  const handleSelectPreset = (presetId) => {
    if (applyScope === 'selected' && selectedClip) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, enhancement: presetId } : c));
    } else {
      setEnhancement(presetId);
      // Clear individual clip overrides when applying to all
      setClips(prev => prev.map(c => ({ ...c, enhancement: undefined })));
    }
  };

  const handleGeneratePreview = async () => {
    if (!videoPath) return;
    setIsPreviewLoading(true);
    setPreviewUrl(null);

    const targetEnhancement = applyScope === 'selected'
      ? (selectedClip?.enhancement || enhancement)
      : enhancement;

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputVideo: videoPath,
          startTime: Math.max(0, currentTime - 0.5),
          enhancement: targetEnhancement
        })
      });
      const data = await res.json();
      if (data.success && data.url) {
        setPreviewUrl(data.url);
      } else {
        alert('Erro ao gerar prévia: ' + (data.error || 'Falha'));
      }
    } catch (err) {
      alert('Erro de conexão ao gerar prévia: ' + err.message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          Restauração de Vídeo (WhatsApp & Baixa Resolução)
        </h3>
        <p className="text-slate-400 text-[11px]">
          Filtros calibrados para corrigir compressão. Selecione onde aplicar e escolha a melhoria desejada.
        </p>
      </div>

      {/* Scope Selector: Apply to whole video OR only selected clip */}
      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-300">
          Onde aplicar o filtro de melhoria?
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setApplyScope('all')}
            className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
              applyScope === 'all'
                ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Em Todo o Vídeo</span>
          </button>

          <button
            onClick={() => setApplyScope('selected')}
            className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
              applyScope === 'selected'
                ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Só no Trecho {selectedClipIndex + 1}</span>
          </button>
        </div>

        {applyScope === 'selected' && (
          <p className="text-[10px] text-indigo-300 pt-0.5">
            O filtro escolhido abaixo será aplicado <b>apenas no Trecho {selectedClipIndex + 1}</b> (de {selectedClip?.start.toFixed(1)}s a {selectedClip?.end.toFixed(1)}s).
          </p>
        )}
      </div>

      {/* Preset cards */}
      <div className="space-y-2">
        {presets.map((p) => {
          const isSelected = currentActive === p.id;
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              onClick={() => handleSelectPreset(p.id)}
              className={`p-3 rounded-xl border transition cursor-pointer relative overflow-hidden ${
                isSelected
                  ? `bg-gradient-to-r ${p.gradient} border-indigo-500 shadow-md shadow-indigo-500/10`
                  : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg bg-slate-800 ${isSelected ? p.border : 'text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200">{p.title}</span>
                    {p.badge && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                        {p.badge}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                )}
              </div>

              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed pl-8">
                {p.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Button to Generate 3-second quick enhanced preview */}
      {currentActive !== 'none' && videoPath && (
        <div className="bg-indigo-950/30 border border-indigo-500/30 p-3 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
            <span>Quer conferir a diferença antes de exportar?</span>
          </div>

          <button
            onClick={handleGeneratePreview}
            disabled={isPreviewLoading}
            className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            {isPreviewLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processando 3s na RTX 4070...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Gerar Prévia Rápida de 3 Segundos</span>
              </>
            )}
          </button>

          {previewUrl && (
            <div className="mt-3 p-2 bg-black rounded-lg border border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-300 font-bold">
                <span className="text-emerald-400">Resultado do Filtro Aplicado:</span>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <video
                src={previewUrl}
                controls
                autoPlay
                className="w-full rounded border border-slate-800"
              />
            </div>
          )}
        </div>
      )}

      {/* Vertical 9:16 with Blurred Background Option */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-slate-200">Formato Vertical 9:16 (Reels/Status)</span>
          </div>

          <button
            onClick={() => setVerticalAspect(!verticalAspect)}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition border cursor-pointer ${
              verticalAspect
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {verticalAspect ? 'Ativado' : 'Desativado'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Transforma vídeos horizontais em 9:16 vertical preenchendo as faixas laterais com uma versão desfocada do próprio vídeo.
        </p>
      </div>
    </div>
  );
}
