export default function Editor({
  prompt,
  setPrompt,
  onGenerate,
  onPublish,
  loading,
  publishing,
  previewExists,
}) {
  return (
    <div className="flex flex-col h-full bg-slate-800 p-6">
      <div className="flex-1 overflow-y-auto">
        <label className="block text-sm font-semibold text-white mb-3">
          Describe your changes:
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Add a dark navbar to the top of the site without removing anything else."
          className="w-full h-48 p-4 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
          disabled={loading || publishing}
        />

        {/* Tips section */}
        <div className="mt-6 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
          <h3 className="font-semibold text-white text-sm mb-2">💡 Tips:</h3>
          <ul className="text-xs text-slate-300 space-y-1">
            <li>• Be specific about what you want to change</li>
            <li>• The AI will preserve all unrelated code</li>
            <li>• Changes appear in the preview instantly</li>
            <li>• Review before publishing to GitHub</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-3 border-t border-slate-700 pt-6">
        <button
          onClick={onGenerate}
          disabled={loading || publishing || !prompt.trim()}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
            loading || publishing || !prompt.trim()
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
        >
          {loading ? '⏳ Generating...' : '✨ Generate Preview'}
        </button>

        <button
          onClick={onPublish}
          disabled={publishing || !previewExists || loading}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
            !previewExists || publishing || loading
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 active:scale-95'
          }`}
        >
          {publishing ? '⏳ Publishing...' : '🚀 Publish Changes'}
        </button>

        {previewExists && (
          <p className="text-xs text-green-400 text-center">✓ Preview ready</p>
        )}
      </div>
    </div>
  );
}
