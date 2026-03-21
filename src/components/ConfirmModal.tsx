import React from 'react';
import { LogOut, X } from 'lucide-react';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div 
        className="modal-content confirm-modal glass-panel animate-fade-in" 
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onCancel} aria-label="Cerrar">
          <X size={20} />
        </button>
        
        <div className="modal-header">
          <div className="modal-icon-wrapper">
            <LogOut size={28} />
          </div>
          <h3>{title}</h3>
        </div>
        
        <p className="modal-message">{message}</p>
        
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="modal-btn primary" onClick={onConfirm}>
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};
