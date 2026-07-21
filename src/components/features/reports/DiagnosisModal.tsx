import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, Search } from 'lucide-react';
import Modal from '../../ui/Modal';

interface DiagnosisModalProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  analysis: string | null;
  error: string | null;
}

export default function DiagnosisModal({ open, onClose, loading, analysis, error }: DiagnosisModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Diagnosing Empty Dataset" size="lg">
      <div className="p-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex items-center gap-3 text-slate-600">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-sm font-medium">Investigating report issue...</span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Analyzing dataset filters, parameter values, and source data with Claude.
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 font-medium">Diagnosis failed</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
          </div>
        )}

        {analysis && !loading && !error && (
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <Search size={16} className="text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Analysis Result</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-600" />
                    <span className="text-emerald-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{analysis}</p>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Use this suggestion in your next chat prompt to correct the report.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
