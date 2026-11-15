import React, { useRef, useEffect, useState } from 'react';
import { FolderPlus, Film, Music, Image as ImageIcon, Plus, Trash2, RefreshCw, Layers, ShieldCheck, Check, Cpu, Loader2 } from 'lucide-react';
import { uploadMediaWithProgress } from '../utils/uploadHelper.js';

export default function MediaPanel({
  mediaList = [],
  setMediaList,
  onAddClipToTimeline,
  onSetAudioTrack,
  onSetLogoOverlay,
  onSetBackgroundLayer,
  backgroundLayer = null,
  logoOverlay = null,
  audioTrack = null,
  clips = []
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Load existing files from uploads directory on mount
  const loadMedia = async () => {
    try {
      const res = await fetch('/api/media');
      const data = await res.json();
      if (data.success && data.media) {
        setMediaList(data.media);
      }
    } catch (err) {
      console.error('Erro ao listar mídias:', err);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || uploading) return;
    setUploading(true);

    for (const file of files) {
      try {
        await uploadMediaWithProgress(file, setUploadStatus);
      } catch (err) {
        console.error('Erro no upload de mídia:', err);
      }
    }

    await loadMedia();
    setUploadStatus(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteMedia = async (filename) => {
    if (!confirm(`Deseja realmente remover o arquivo "${filename}" do banco de mídias?`)) return;
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadMedia();
      }
    } catch (err) {
      console.error('Erro ao excluir mídia:', err);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-0.5">
            <FolderPlus className="w-4 h-4 text-indigo-400" />
            Banco de Mídias & Arquivos
          </h3>
          <p className="text-slate-400 text-[11px]">
            Seus vídeos, fotos e áudios salvos no projeto.
          </p>
        </div>

        <button
          onClick={loadMedia}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          title="Atualizar lista de arquivos"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Upload button */}
      <div>
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={handleUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-200 font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-950/30 disabled:opacity-50 disabled:cursor-wait"
        >
          <Plus className="w-4 h-4 text-cyan-300" />
          <span>{uploading ? 'Processando arquivo...' : '+ Importar Vídeo, Áudio ou Imagem'}</span>
        </button>

        {uploadStatus && (
          <div className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300 truncate">
                {uploadStatus.stage === 'transcoding' ? (
                  <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                )}
                <span className="truncate">{uploadStatus.fileName}</span>
              </span>
              <span className="text-[11px] font-bold text-cyan-300 tabular-nums">
                {uploadStatus.percent || 0}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${Math.max(4, uploadStatus.percent || 0)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-300 leading-snug">
              {uploadStatus.message}
            </p>
          </div>
        )}
      </div>

      {/* Media cards list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-300 block text-[11px]">
            Arquivos Disponíveis ({mediaList.length})
          </span>
          <span className="text-[10px] text-slate-500">Clique para adicionar às camadas</span>
        </div>

        {mediaList.length === 0 ? (
          <div className="p-6 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/40">
            Nenhuma mídia no projeto. Importe arquivos acima para usar em camadas ou na timeline.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {mediaList.map((item) => {
              const isBgActive = backgroundLayer?.path === item.path;
              const isLogoActive = logoOverlay?.enabled && logoOverlay?.path === item.path;
              const isAudioActive = audioTrack?.path === item.path;

              return (
                <div
                  key={item.id || item.filename}
                  className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700 overflow-hidden">
                        {item.type === 'video' ? (
                          <Film className="w-4 h-4 text-indigo-400" />
                        ) : item.type === 'audio' ? (
                          <Music className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <img
                            src={encodeURI(item.url)}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-slate-200 truncate text-[11px]" title={item.name}>
                            {item.name}
                          </p>
                          {isBgActive && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold border border-purple-500/30">
                              Fundo Ativo
                            </span>
                          )}
                          {isLogoActive && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                              Logo Ativo
                            </span>
                          )}
                          {isAudioActive && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
                              Trilha Ativa
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {item.type === 'video' || item.type === 'audio'
                            ? `${item.duration > 0 ? item.duration.toFixed(1) + 's' : ''} ${item.width ? item.width + 'x' + item.height : ''}`
                            : `${item.width ? item.width + 'x' + item.height : 'Imagem'}`}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteMedia(item.filename)}
                      className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                      title="Excluir arquivo do disco"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Layer / Placement Action buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-800/80">
                    {item.type === 'video' && (
                      <>
                        <button
                          onClick={() => onAddClipToTimeline(item)}
                          className="flex-1 py-1 px-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer shadow"
                          title="Adicionar à sequência da Camada 2 (Vídeo)"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Na Sequência</span>
                        </button>

                        <button
                          onClick={() => onSetBackgroundLayer(item)}
                          className={`py-1 px-2 rounded-md font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border ${
                            isBgActive
                              ? 'bg-purple-950/60 text-purple-300 border-purple-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title="Usar vídeo como fundo (Camada 1)"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Fundo</span>
                        </button>
                      </>
                    )}

                    {item.type === 'image' && (
                      <>
                        <button
                          onClick={() => onSetLogoOverlay(item)}
                          className={`flex-1 py-1 px-2 rounded-md font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer shadow ${
                            isLogoActive
                              ? 'bg-amber-600 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          }`}
                          title="Colocar como logo/selo na Camada 3 (Superior)"
                        >
                          <Layers className="w-3 h-3" />
                          <span>+ Camada Superior (Logo/Selo)</span>
                        </button>

                        <button
                          onClick={() => onSetBackgroundLayer(item)}
                          className={`flex-1 py-1 px-2 rounded-md font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer border ${
                            isBgActive
                              ? 'bg-purple-950/80 text-purple-300 border-purple-500'
                              : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
                          }`}
                          title="Colocar como imagem de fundo na Camada 1 (Inferior / Atrás do Vídeo)"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{isBgActive ? 'Fundo Ativo' : '+ Fundo (Camada Inferior)'}</span>
                        </button>
                      </>
                    )}

                    {item.type === 'audio' && (
                      <button
                        onClick={() => onSetAudioTrack(item)}
                        className={`flex-1 py-1 px-2 rounded-md font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer shadow ${
                          isAudioActive ? 'bg-emerald-600 text-white' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                        title="Usar como trilha sonora musical"
                      >
                        <Music className="w-3 h-3" />
                        <span>{isAudioActive ? 'Trilha Sonora Ativa' : 'Usar como Trilha Sonora'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
