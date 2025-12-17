import { useEffect, useRef } from 'react';

export default function PreviewModal({ isOpen, preview, onClose, onPublish, publishing }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (preview && iframeRef.current) {
      const iframe = iframeRef.current;
      iframe.srcdoc = preview;
    }
  }, [preview]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !preview) {
    return null;
  }

  const handleBackdropClick = (e) => {
    if (e.target.id === 'preview-modal-backdrop') {
      onClose();
    }
  };

  return (
    <div
      id="preview-modal-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="flex h-[90vh] w-[90%] max-w-4xl flex-col overflow-hidden rounded-xl bg-slate-800 shadow-2xl">
        {/* Modal Header */}
        <div className="border-b border-slate-700 bg-slate-900 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Preview Changes</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <iframe
            ref={iframeRef}
            className="w-full h-96 rounded-lg border border-slate-600 bg-white"
            title="Preview of AI generated changes"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>

        {/* Modal Actions */}
        <div className="border-t border-slate-700 bg-slate-900 px-6 py-4 flex gap-3">
          <button
            onClick={onPublish}
            disabled={publishing}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:text-slate-400 text-white font-semibold py-2 px-4 rounded-lg transition-all"
          >
            {publishing ? '⏳ Publishing...' : '🚀 Publish Changes'}
          </button>
          <button
            onClick={onClose}
            disabled={publishing}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:text-slate-400 text-white font-semibold py-2 px-4 rounded-lg transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
