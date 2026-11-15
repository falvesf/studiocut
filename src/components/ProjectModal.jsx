import React, { useState, useEffect } from 'react';
import { X, Save, FolderOpen, Trash2, FilePlus2, Clock, Film, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDialog } from './DialogProvider.jsx';

export default function ProjectModal({
  isOpen,
  onClose,
  currentProjectName = 'Sem título',
  currentProjectId = null,
  hasVideo = false,
  onSaveProject,
  onLoadProject,
  onNewProject
}) {
  const { showConfirm } = useDialog();
  const [nameInput, setNameInput] = useState('');
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      }
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNameInput(currentProjectName && currentProjectName !== 'Sem título' ? currentProjectName : '');
      setFeedback(null);
      fetchProjects();
    }
  }, [isOpen, currentProjectName]);

  if (!isOpen) return null;

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'Digite um nome para o projeto.' });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const result = await onSaveProject(trimmed);
      if (result?.ok) {
        setFeedback({ type: 'success', text: `Projeto "${trimmed}" salvo com sucesso!` });
        await fetchProjects();
      } else {
        setFeedback({ type: 'error', text: result?.error || 'Falha ao salvar projeto.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = async (projId) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projId)}`);
      if (!res.ok) {
        setFeedback({ type: 'error', text: 'Não foi possível abrir o projeto.' });
        return;
      }
      const proj = await res.json();
      onLoadProject(proj);
      onClose();
    } catch (err) {
      setFeedback({ type: 'error', text: 'Erro de rede ao abrir projeto.' });
    }
  };

  const handleDelete = async (projId, projName) => {
    const confirmed = await showConfirm({
      title: 'Excluir Projeto',
      message: `Tem certeza que deseja excluir o projeto "${projName}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projId)}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projId));
        setFeedback({ type: 'success', text: `Projeto "${projName}" excluído.` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Erro ao excluir projeto.' });
    }
  };

  const handleCreateNew = async () => {
    if (hasVideo) {
      const confirmed = await showConfirm({
        title: 'Novo Projeto em Branco',
        message: 'Iniciar um novo projeto em branco? Alterações não salvas em um projeto nomeado serão limpas do rascunho.',
        confirmText: 'Iniciar Novo',
        cancelText: 'Cancelar',
        variant: 'warning'
      });
      if (!confirmed) return;
    }
    onNewProject();
    onClose();
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatDuration = (sec) => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Projetos & Salvamento</h2>
              <p className="text-xs text-slate-400">
                Rascunho automático ativo — seu trabalho é salvo continuamente contra quedas ou F5.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {feedback && (
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Save current project */}
          <form onSubmit={handleSaveSubmit} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Salvar Projeto Atual com Nome
              </label>
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              >
                <FilePlus2 className="w-3.5 h-3.5 text-indigo-400" />
                Novo Projeto em Branco
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex: Reel Produto Calça Tática..."
                className="flex-1 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Projeto'}
              </button>
            </div>
          </form>

          {/* Saved projects list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Meus Projetos Salvos ({projects.length})
              </h3>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-sm text-slate-500">Carregando projetos...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
                <p className="text-sm text-slate-400">Nenhum projeto nomeado salvo ainda.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Dê um nome acima e clique em "Salvar Projeto" para guardar aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((proj) => {
                  const isCurrent = currentProjectId && proj.id === currentProjectId;
                  return (
                    <div
                      key={proj.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                        isCurrent
                          ? 'bg-indigo-500/10 border-indigo-500/40'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">{proj.name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Aberto
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300">
                            {proj.targetAspect}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(proj.updatedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            {proj.clipCount} {proj.clipCount === 1 ? 'trecho' : 'trechos'} • {formatDuration(proj.duration)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpen(proj.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 hover:border-indigo-500 transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(proj.id, proj.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                          title="Excluir projeto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
