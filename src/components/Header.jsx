import React from 'react';
import { Video, Cpu, Sparkles, Download, Upload, Zap, Undo2, Redo2, Save, FolderOpen, Check } from 'lucide-react';

export default function Header({
  onUploadClick,
  onExportClick,
  hasVideo,
  isRendering,
  undo = () => {},
  redo = () => {},
  canUndo = false,
  canRedo = false,
  systemInfo = null,
  projectName = 'Sem título',
  saveStatus = 'idle',
  onSaveClick = () => {},
  onProjectsClick = () => {},
  isImporting = false
}) {
  const gpuName = systemInfo?.gpuName || 'GPU Acelerada';
  const encoderLabel = systemInfo?.encoderLabel || 'NVENC';
  const encoderType = systemInfo?.encoderType || 'nvenc';

  // Format clean GPU display name (short and readable)
  const cleanGpuName = gpuName
    .replace('Laptop GPU', '')
    .replace('(R)', '')
    .replace('Graphics', '')
    .trim();
  return (
    <header className="h-14 border-b border-slate-800 bg-[#121520] px-4 flex items-center justify-between z-20">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Video className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              StudioCut
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              PRO
            </span>
          </div>
        </div>

        {/* Undo / Redo Actions in Top Header */}
        <div className="flex items-center gap-1 border-l border-slate-800 ml-2 pl-3">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              canUndo
                ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer border border-slate-700'
                : 'text-slate-600 cursor-not-allowed opacity-40 border border-transparent'
            }`}
            title="Desfazer última alteração (Ctrl + Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Desfazer</span>
          </button>

          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              canRedo
                ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer border border-slate-700'
                : 'text-slate-600 cursor-not-allowed opacity-40 border border-transparent'
            }`}
            title="Refazer alteração (Ctrl + Y ou Ctrl + Shift + Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Refazer</span>
          </button>
        </div>

        {/* Project Name & Auto-save Status */}
        <button
          onClick={onProjectsClick}
          title="Abrir Gerenciador de Projetos"
          className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <span className="max-w-[140px] truncate font-medium">{projectName || 'Sem título'}</span>
          {saveStatus === 'saving' && (
            <span className="text-[10px] text-amber-400 animate-pulse">Salvando...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400">
              <Check className="w-3 h-3" />
              Salvo
            </span>
          )}
        </button>

        <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-slate-800 text-xs text-slate-400">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
              encoderType === 'nvenc'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : encoderType === 'qsv'
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
                : encoderType === 'amf'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                : 'bg-slate-700/20 text-slate-300 border-slate-700/40'
            }`}
            title={`GPU Detectada: ${gpuName} • Codificador Ativo: ${encoderLabel}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                encoderType === 'nvenc'
                  ? 'bg-emerald-400'
                  : encoderType === 'qsv'
                  ? 'bg-cyan-400'
                  : encoderType === 'amf'
                  ? 'bg-rose-400'
                  : 'bg-slate-400'
              }`}
            />
            <span>{cleanGpuName} ({encoderLabel} Ativo)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
            <Zap className="w-3 h-3" />
            100% Livre & Sem Marcas
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onProjectsClick}
          title="Abrir ou gerenciar projetos salvos"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition-all cursor-pointer"
        >
          <FolderOpen className="w-4 h-4 text-indigo-400" />
          <span className="hidden sm:inline">Projetos</span>
        </button>

        <button
          onClick={onSaveClick}
          title="Salvar Projeto (Ctrl+S)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Salvar</span>
        </button>

        <button
          onClick={onUploadClick}
          disabled={isImporting}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
            isImporting
              ? 'bg-slate-800/60 text-indigo-300 border-indigo-500/40 cursor-wait opacity-80'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600 cursor-pointer'
          }`}
        >
          <Upload className={`w-4 h-4 ${isImporting ? 'text-indigo-400 animate-bounce' : 'text-slate-300'}`} />
          <span>{isImporting ? 'Processando...' : hasVideo ? 'Trocar Vídeo' : 'Importar Vídeo'}</span>
        </button>

        <button
          onClick={onExportClick}
          disabled={!hasVideo || isRendering}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-lg cursor-pointer ${
            hasVideo && !isRendering
              ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-indigo-600/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Exportar Vídeo</span>
        </button>
      </div>
    </header>
  );
}

