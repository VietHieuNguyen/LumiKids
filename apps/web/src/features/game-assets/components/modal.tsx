"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={`asset-dialog ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="asset-icon-button"
          aria-label="Đóng hộp thoại"
        >
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
