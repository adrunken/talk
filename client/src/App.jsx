import { useState, useEffect } from 'react';
import Editor from './components/Editor';
import ErrorDialog from './components/ErrorDialog';
import PreviewModal from './components/PreviewModal';
import Chess from './components/Chess';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Fetch initial preview
  useEffect(() => {
    fetchPreview();
  }, []);

  async function fetchPreview() {
    try {
      const response = await fetch('/api/preview');
      const data = await response.json();
      if (data.preview) {
        setPreview(data.preview);
      }
    } catch (err) {
      console.error('Error fetching preview:', err);
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError('Please enter a description of the changes you want to make.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.details
          ? Array.isArray(data.details)
            ? data.details.join('\n')
            : data.details
          : data.error;
        setError(errorMsg);
        setLoading(false);
        return;
      }

      setPreview(data.preview);
      setShowPreviewModal(true);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setLoading(false);
    }
  }

  async function handlePublish() {
    if (!preview) {
      setError('No preview available to publish.');
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.details || data.error || 'Failed to publish changes');
        setPublishing(false);
        return;
      }

      setError(null);
      setPrompt('');
      setShowPreviewModal(false);

      const message = data.prUrl
        ? `✓ Pull Request Created!\n\nPR #${data.prNumber}: ${data.message}\n\nURL: ${data.prUrl}`
        : `✓ Changes published successfully!\n\n${data.message}`;

      alert(message);
      setPublishing(false);
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex h-screen flex-col">
        {/* Header */}
        <div className="border-b border-slate-700 bg-slate-900 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">AI Code Modifier</h1>
          <p className="mt-1 text-sm text-slate-400">
            Describe changes to your website, preview them live, and publish when ready
          </p>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Editor panel */}
          <div className="flex-1 border-r border-slate-700 overflow-y-auto">
            <Editor
              prompt={prompt}
              setPrompt={setPrompt}
              onGenerate={handleGenerate}
              onPublish={handlePublish}
              loading={loading}
              publishing={publishing}
              previewExists={!!preview}
            />
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal
        isOpen={showPreviewModal}
        preview={preview}
        onClose={() => setShowPreviewModal(false)}
        onPublish={handlePublish}
        publishing={publishing}
      />

      {/* Error dialog */}
      {error && (
        <ErrorDialog
          error={error}
          onClose={() => setError(null)}
        />
      )}
    </div>
  );
}
