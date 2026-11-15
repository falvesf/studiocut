import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

const DialogContext = createContext(null);

function inferVariant(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('erro') || lower.includes('falha')) return 'danger';
  if (lower.includes('sucesso') || lower.includes('aplicado') || lower.includes('extraído com sucesso')) return 'success';
  return 'info';
}

export function DialogProvider({ children }) {
  const [queue, setQueue] = useState([]);

  const enqueueDialog = useCallback((config) => {
    return new Promise((resolve) => {
      setQueue((prev) => [...prev, { ...config, resolve }]);
    });
  }, []);

  const showAlert = useCallback(
    (messageOrOpts, titleArg = null, variantArg = null) => {
      const opts =
        typeof messageOrOpts === 'object' && messageOrOpts !== null
          ? messageOrOpts
          : {
              message: String(messageOrOpts || ''),
              title: titleArg,
              variant: variantArg
            };
      const variant = opts.variant || inferVariant(opts.message);
      const defaultTitle =
        variant === 'danger'
          ? 'Atenção — Erro'
          : variant === 'success'
            ? 'Concluído'
            : 'Aviso do Sistema';
      return enqueueDialog({
        mode: 'alert',
        title: opts.title || defaultTitle,
        message: opts.message || '',
        variant,
        confirmText: opts.confirmText || 'OK'
      });
    },
    [enqueueDialog]
  );

  const showConfirm = useCallback(
    (messageOrOpts, titleArg = null, variantArg = 'warning') => {
      const opts =
        typeof messageOrOpts === 'object' && messageOrOpts !== null
          ? messageOrOpts
          : {
              message: String(messageOrOpts || ''),
              title: titleArg,
              variant: variantArg
            };
      return enqueueDialog({
        mode: 'confirm',
        title: opts.title || 'Confirmar Ação',
        message: opts.message || '',
        variant: opts.variant || 'warning',
        confirmText: opts.confirmText || 'Confirmar',
        cancelText: opts.cancelText || 'Cancelar'
      });
    },
    [enqueueDialog]
  );

  const current = queue[0] || null;

  const closeCurrent = useCallback(
    (result) => {
      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [active, ...rest] = prev;
        active.resolve(active.mode === 'confirm' ? Boolean(result) : undefined);
        return rest;
      });
    },
    []
  );

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCurrent(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        closeCurrent(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, closeCurrent]);

  const variantConfig = {
    danger: {
      icon: XCircle,
      iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
      btn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20'
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      btn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20'
    },
    success: {
      icon: CheckCircle2,
      iconBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      btn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
    },
    info: {
      icon: Info,
      iconBg: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400',
      btn: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
    }
  };

  const activeStyle = current ? variantConfig[current.variant] || variantConfig.info : variantConfig.info;
  const Icon = activeStyle.icon;

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {current && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => closeCurrent(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${activeStyle.iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white leading-snug">{current.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => closeCurrent(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-5 pt-1">
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {current.message}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/60 border-t border-slate-800">
              {current.mode === 'confirm' && (
                <button
                  type="button"
                  onClick={() => closeCurrent(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  {current.cancelText}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => closeCurrent(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer ${activeStyle.btn}`}
              >
                {current.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used inside a DialogProvider');
  }
  return ctx;
}
