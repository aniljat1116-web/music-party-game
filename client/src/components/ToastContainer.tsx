import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useGame } from '../context/GameContext';
import type { ToastType } from '../types';

const getToastIcon = (type: ToastType) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={18} color="#10b981" />;
    case 'warning':
      return <AlertTriangle size={18} color="#f59e0b" />;
    case 'error':
      return <AlertCircle size={18} color="#f43f5e" />;
    case 'info':
    default:
      return <Info size={18} color="#06b6d4" />;
  }
};

const getToastBorder = (type: ToastType) => {
  switch (type) {
    case 'success':
      return '1px solid rgba(16, 185, 129, 0.4)';
    case 'warning':
      return '1px solid rgba(245, 158, 11, 0.4)';
    case 'error':
      return '1px solid rgba(244, 63, 94, 0.4)';
    case 'info':
    default:
      return '1px solid rgba(6, 182, 212, 0.4)';
  }
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useGame();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 110,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        maxWidth: '380px',
        width: 'calc(100vw - 2rem)',
        pointerEvents: 'none'
      }}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(15, 22, 41, 0.94)',
            backdropFilter: 'blur(16px)',
            border: getToastBorder(toast.type),
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ flexShrink: 0, display: 'flex' }}>{getToastIcon(toast.type)}</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-main)', lineHeight: 1.4 }}>
              {toast.message}
            </span>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.2rem',
              display: 'flex',
              borderRadius: 'var(--radius-sm)'
            }}
            title="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
};
