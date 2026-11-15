import React, { useRef } from 'react';
import { Image as ImageIcon, Upload, Trash2, Eye, LayoutGrid } from 'lucide-react';

export default function OverlayPanel({
  logoOverlay,
  setLogoOverlay
}) {
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
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
        setLogoOverlay(prev => ({
          ...prev,
          enabled: true,
          name: data.originalName,
          path: data.path,
          url: data.url
        }));
      }
    } catch (err) {
      alert('Erro ao enviar imagem: ' + err.message);
    }
  };

  const positions = [
    { id: 'top-left', label: 'Sup. Esquerdo' },
    { id: 'top-right', label: 'Sup. Direito' },
    { id: 'center', label: 'Centro' },
    { id: 'bottom-left', label: 'Inf. Esquerdo' },
    { id: 'bottom-right', label: 'Inf. Direito' }
  ];

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-indigo-400" />
          Logo & Imagens de Apoio (Marca d'água)
        </h3>
        <p className="text-slate-400 text-[11px]">
          Insira seu logotipo, selo ou imagem sobre o vídeo com transparência e posição personalizada.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-200">
            Exibir Imagem no Vídeo
          </span>
          <button
            onClick={() => setLogoOverlay(prev => ({ ...prev, enabled: !prev.enabled }))}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition border cursor-pointer ${
              logoOverlay.enabled
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {logoOverlay.enabled ? 'Ativado' : 'Desativado'}
          </button>
        </div>

        {/* Upload or change Image */}
        {logoOverlay.url ? (
          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-black/50 rounded-lg border border-slate-600 flex items-center justify-center overflow-hidden p-1">
                <img
                  src={logoOverlay.url}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="truncate max-w-[170px]">
                <p className="font-semibold text-slate-200 truncate">{logoOverlay.name || 'Imagem Carregada'}</p>
                <p className="text-[10px] text-slate-400">Ativa no projeto</p>
              </div>
            </div>

            <button
              onClick={() => setLogoOverlay(prev => ({ ...prev, url: '', path: '', enabled: false }))}
              className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-3 rounded-lg border-2 border-dashed border-slate-700 hover:border-indigo-400 bg-slate-800/40 text-slate-300 font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Carregar Imagem / Logotipo (PNG ou JPG)</span>
            </button>
          </div>
        )}

        {logoOverlay.enabled && logoOverlay.url && (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            {/* Position Picker */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                <span>Posição na Tela</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {positions.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setLogoOverlay(prev => ({ ...prev, position: p.id }))}
                    className={`py-1 px-2 rounded text-[10px] font-semibold border transition cursor-pointer ${
                      logoOverlay.position === p.id
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Tamanho / Escala da Logo</span>
                <span className="font-mono text-indigo-300 font-bold">{logoOverlay.scale || 15}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="1"
                value={logoOverlay.scale || 15}
                onChange={(e) => setLogoOverlay(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Opacity Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Opacidade (Transparência)</span>
                <span className="font-mono text-indigo-300 font-bold">{logoOverlay.opacity || 100}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={logoOverlay.opacity || 100}
                onChange={(e) => setLogoOverlay(prev => ({ ...prev, opacity: parseInt(e.target.value) }))}
                className="w-full cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

