import React, { useRef, useEffect, useState } from 'react';
import { FolderPlus, Film, Music, Image as ImageIcon, Plus, Trash2, Layers, ShieldCheck, Check, Cpu, Loader2, Globe, Search, Download, Key, Play } from 'lucide-react';
import { uploadMediaWithProgress } from '../utils/uploadHelper.js';
import { useDialog } from './DialogProvider.jsx';

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
  const { showConfirm, showAlert } = useDialog();
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Sub-tab: 'local' (Project Media) | 'online' (Free Online Stock)
  const [mediaSubTab, setMediaSubTab] = useState('local');
  const [stockType, setStockType] = useState('audio'); // 'audio' | 'image' | 'video'
  const [stockQuery, setStockQuery] = useState('motivational');
  const [stockResults, setStockResults] = useState([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [importingStockId, setImportingStockId] = useState(null);
  const [previewAudioId, setPreviewAudioId] = useState(null);
  const [previewVideoId, setPreviewVideoId] = useState(null);
  const [previewBuffering, setPreviewBuffering] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [pixabayKey, setPixabayKey] = useState(() => localStorage.getItem('studiocut_pixabay_key') || '');

  const searchStockMedia = async (customQuery = null, customType = null) => {
    const q = (customQuery !== null ? customQuery : stockQuery).trim() || 'nature';
    const t = customType || stockType;
    setIsSearchingStock(true);
    try {
      const params = new URLSearchParams({ type: t, q });
      if (pixabayKey.trim()) params.set('pixabayKey', pixabayKey.trim());
      const res = await fetch(`/api/stock/search?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setStockResults(data.items || []);
      } else {
        showAlert(data.error || 'Erro ao buscar mídias online.');
      }
    } catch (err) {
      showAlert('Erro de conexão ao buscar biblioteca online: ' + err.message);
    } finally {
      setIsSearchingStock(false);
    }
  };

  useEffect(() => {
    if (mediaSubTab === 'online' && stockResults.length === 0) {
      searchStockMedia();
    }
  }, [mediaSubTab]);

  const handleImportStock = async (item) => {
    if (importingStockId) return;
    setImportingStockId(item.id);
    try {
      const res = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          title: item.title,
          type: stockType
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showAlert(data.error || 'Falha ao baixar mídia online.');
        return;
      }

      const alreadyInProject = mediaList.some(m => m.url === data.url || m.path === data.path);
      if (!alreadyInProject) {
        const newMedia = {
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: data.originalName || item.title,
          filename: data.filename,
          path: data.path,
          url: data.url,
          type: data.type || stockType,
          duration: data.info?.duration || item.duration || 0,
          width: data.info?.width || item.width || 0,
          height: data.info?.height || item.height || 0
        };
        setMediaList(prev => [newMedia, ...prev]);
      }

      setMediaSubTab('local');
      showAlert({
        title: data.reused ? 'Mídia Reutilizada' : 'Mídia Baixada no Projeto!',
        message: data.reused
          ? `"${item.title}" já existia no cache e foi adicionada ao seu projeto sem duplicar.`
          : `"${item.title}" foi baixada e adicionada ao Banco de Mídias deste projeto!`,
        variant: 'success'
      });
    } catch (err) {
      showAlert('Erro ao importar mídia online: ' + err.message);
    } finally {
      setImportingStockId(null);
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || uploading) return;
    setUploading(true);

    const reusedNames = [];
    const alreadyInProjectNames = [];

    for (const file of files) {
      try {
        const data = await uploadMediaWithProgress(file, setUploadStatus);
        if (data?.success) {
          const existsInProject = mediaList.some(
            (m) => m.url === data.url || m.path === data.path
          );
          if (existsInProject) {
            alreadyInProjectNames.push(data.originalName || file.name);
          } else {
            const newMedia = {
              id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: data.originalName || file.name,
              filename: data.filename,
              path: data.path,
              url: data.url,
              type: data.type || 'video',
              duration: data.info?.duration || 0,
              width: data.info?.width || 0,
              height: data.info?.height || 0
            };
            setMediaList((prev) => {
              if (prev.some((m) => m.url === newMedia.url || m.path === newMedia.path)) {
                return prev;
              }
              return [newMedia, ...prev];
            });
            if (data.reused) {
              reusedNames.push(data.originalName || file.name);
            }
          }
        }
      } catch (err) {
        console.error('Erro no upload de mídia:', err);
        showAlert('Erro ao importar mídia: ' + err.message);
      }
    }

    setUploadStatus(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (alreadyInProjectNames.length > 0) {
      showAlert({
        title: 'Mídia já presente no projeto',
        message: `O arquivo "${alreadyInProjectNames.join(', ')}" já estava disponível no banco de mídias deste projeto e não foi duplicado.`,
        variant: 'info'
      });
    } else if (reusedNames.length > 0) {
      showAlert({
        title: 'Mídia reutilizada sem duplicidade',
        message: `"${reusedNames.join(', ')}" já existia no servidor e foi vinculado a este projeto instantaneamente, sem recriar o arquivo na pasta uploads.`,
        variant: 'success'
      });
    }
  };

  const handleDeleteMedia = async (item) => {
    const label = item.name || item.filename || 'mídia';
    const confirmed = await showConfirm({
      title: 'Remover Mídia do Projeto',
      message: `Deseja remover "${label}" do banco de mídias deste projeto?`,
      confirmText: 'Remover',
      cancelText: 'Cancelar',
      variant: 'danger'
    });
    if (!confirmed) return;
    setMediaList((prev) =>
      prev.filter((m) => m.id !== item.id && m.url !== item.url)
    );
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 mb-0.5">
            <FolderPlus className="w-4 h-4 text-indigo-400" />
            Banco de Mídias do Projeto
          </h3>
          <p className="text-slate-400 text-[11px]">
            Mídias exclusivas deste projeto (sem duplicar arquivos já importados).
          </p>
        </div>
      </div>

      {/* Sub-tabs: Local Project Media vs Free Online Library */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setMediaSubTab('local')}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mediaSubTab === 'local'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Do Projeto ({mediaList.length})
        </button>
        <button
          type="button"
          onClick={() => setMediaSubTab('online')}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mediaSubTab === 'online'
              ? 'bg-cyan-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Biblioteca Online
        </button>
      </div>

      {mediaSubTab === 'online' ? (
        <div className="space-y-3">
          {/* Stock Type Selector */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'audio', label: 'Músicas', icon: Music },
              { id: 'image', label: 'Imagens', icon: ImageIcon },
              { id: 'video', label: 'Vídeos', icon: Film }
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setStockType(t.id);
                    searchStockMedia(stockQuery, t.id);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition cursor-pointer ${
                    stockType === t.id
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              searchStockMedia();
            }}
            className="flex gap-1.5"
          >
            <input
              type="text"
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              placeholder="Buscar músicas, fundos, vídeos..."
              className="flex-1 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-[11px] text-white outline-none"
            />
            <button
              type="submit"
              disabled={isSearchingStock}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowKeyBox(!showKeyBox)}
              title="Chave opcional Pixabay (Grátis)"
              className={`px-2 py-1.5 rounded-lg border text-slate-300 cursor-pointer ${
                pixabayKey ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
            </button>
          </form>

          {showKeyBox && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 space-y-1.5">
              <p className="text-[10px] text-slate-300">
                Opcional: cole sua chave gratuita do <strong>Pixabay</strong> para ampliar vídeos/fotos em HD (já funciona sem chave via Openverse &amp; Wikimedia!).
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={pixabayKey}
                  onChange={(e) => {
                    setPixabayKey(e.target.value);
                    localStorage.setItem('studiocut_pixabay_key', e.target.value);
                  }}
                  placeholder="Pixabay API Key (opcional)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none"
                />
              </div>
            </div>
          )}

          {/* Quick Topic Chips */}
          <div className="flex flex-wrap gap-1">
            {['motivational', 'lofi', 'nature', 'neon', 'tech', 'abstract'].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setStockQuery(tag);
                  searchStockMedia(tag);
                }}
                className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[9px] border border-slate-700/60 cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Results List */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {isSearchingStock ? (
              <div className="py-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span>Buscando mídias gratuitas...</span>
              </div>
            ) : stockResults.length === 0 ? (
              <div className="py-6 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Nenhum resultado encontrado. Tente outra palavra em inglês (ex: <em>happy, forest, synth</em>).
              </div>
            ) : (
              stockResults.map((item) => {
                const isImportingThis = importingStockId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2"
                  >
                    <div className="flex items-center gap-2.5">
                      {item.thumbnail ? (
                        <img
                          src={`/api/stock/proxy?url=${encodeURIComponent(item.thumbnail)}`}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-12 h-10 rounded-lg object-cover bg-slate-800 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                          {stockType === 'audio' ? (
                            <Music className="w-4 h-4 text-cyan-400" />
                          ) : stockType === 'image' ? (
                            <ImageIcon className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Film className="w-4 h-4 text-indigo-400" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-200 truncate text-[11px]" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[9px] text-slate-400 truncate">
                          {item.author} {item.duration > 0 ? `• ${item.duration}s` : ''} • {item.source}
                        </p>
                      </div>
                    </div>

                    {stockType === 'audio' && (
                      <div className="space-y-1.5">
                        {previewAudioId === item.id ? (
                          <div className="space-y-1">
                            {previewBuffering && (
                              <div className="flex items-center gap-1.5 text-[10px] text-cyan-300">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Carregando áudio em buffer...</span>
                              </div>
                            )}
                            {previewError === item.id ? (
                              <p className="text-[10px] text-rose-400">
                                Prévia indisponível neste servidor externo.
                              </p>
                            ) : (
                              <audio
                                src={item.url}
                                controls
                                autoPlay
                                onLoadStart={() => { setPreviewBuffering(true); setPreviewError(null); }}
                                onWaiting={() => setPreviewBuffering(true)}
                                onCanPlay={() => setPreviewBuffering(false)}
                                onPlaying={() => setPreviewBuffering(false)}
                                onError={() => { setPreviewBuffering(false); setPreviewError(item.id); }}
                                className="w-full h-7"
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewError(null);
                              setPreviewBuffering(true);
                              setPreviewAudioId(item.id);
                            }}
                            className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-emerald-400" />
                            Ouvir Prévia
                          </button>
                        )}
                      </div>
                    )}

                    {stockType === 'video' && (
                      <div className="space-y-1.5">
                        {previewVideoId === item.id ? (
                          <div className="space-y-1">
                            {previewBuffering && (
                              <div className="flex items-center gap-1.5 text-[10px] text-cyan-300">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Carregando vídeo em buffer...</span>
                              </div>
                            )}
                            {previewError === item.id ? (
                              <p className="text-[10px] text-rose-400">
                                Prévia indisponível neste formato/link.
                              </p>
                            ) : (
                              <video
                                src={item.url}
                                controls
                                autoPlay
                                playsInline
                                muted
                                onLoadStart={() => { setPreviewBuffering(true); setPreviewError(null); }}
                                onWaiting={() => setPreviewBuffering(true)}
                                onCanPlay={() => setPreviewBuffering(false)}
                                onPlaying={() => setPreviewBuffering(false)}
                                onError={() => { setPreviewBuffering(false); setPreviewError(item.id); }}
                                className="w-full max-h-40 rounded-lg bg-black border border-slate-700"
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewError(null);
                              setPreviewBuffering(true);
                              setPreviewVideoId(item.id);
                            }}
                            className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-cyan-400" />
                            Assistir Prévia
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={Boolean(importingStockId)}
                      onClick={() => handleImportStock(item)}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {isImportingThis ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Baixando para o projeto...
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          Baixar e Usar no Projeto
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
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
                      onClick={() => handleDeleteMedia(item)}
                      className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                      title="Remover mídia deste projeto"
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
        </>
      )}
    </div>
  );
}
