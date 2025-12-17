import { useEffect, useRef } from 'react';

export default function Preview({ preview, loading }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (preview && iframeRef.current) {
      const iframe = iframeRef.current;
      iframe.srcdoc = preview;
    }
  }, [preview]);

  return (
    <div className="flex flex-col h-full bg-slate-700 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-600 bg-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Live Preview</h2>
          <p className="text-xs text-slate-400 mt-1">
            {preview ? 'Updated' : 'No preview generated yet'}
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-blue-400 text-sm">
            <div className="animate-spin">⏳</div>
            Generating...
          </div>
        )}
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <iframe
            ref={iframeRef}
            className="w-full h-full border-none"
            title="Live Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-400 text-lg font-medium">
                No preview yet
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Generate a preview to see changes here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
