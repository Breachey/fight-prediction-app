import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import './ConfirmDialog.css';

function ConfirmDialog({
  open,
  title,
  summary,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'caution',
  isPending = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isPending) {
        onCancelRef.current?.();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled)') || [])];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isPending, open]);

  if (!open) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog confirm-dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="confirm-dialog__heading">
          <AlertTriangle size={22} strokeWidth={2} aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
        </div>
        <p id={descriptionId} className="confirm-dialog__summary">{summary}</p>
        {details.length > 0 && (
          <ul className="confirm-dialog__details">
            {details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
        <div className="confirm-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--confirm"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
