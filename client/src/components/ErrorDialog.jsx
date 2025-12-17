export default function ErrorDialog({ error, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-3">
          <div className="text-red-500 text-2xl flex-shrink-0">⚠️</div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">
              {error}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
