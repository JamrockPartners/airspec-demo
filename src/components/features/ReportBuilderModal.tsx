import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Save, Loader2, Bot, User, Sparkles, Paperclip, Image as ImageIcon, Zap, Code2, Copy, Download, Lock } from 'lucide-react';
import { reportService } from '../../services';
import type { ModelAvailability } from '../../services/reportService';
import type { ChatMessage, AirspecDocument, ChatImageAttachment } from '../../types/airspec';
import type { GenerateProgressEvent } from '../../services/reportService';
import ReportPreview from './reports/ReportPreview';
import SnakeGame from './SnakeGame';
import ChatMarkdown from '../ui/ChatMarkdown';

interface ReportBuilderModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  isChatting: boolean;
  isGenerating: boolean;
  isUploading: boolean;
  readyToGenerate: boolean;
  error: string | null;
  currentSpec: AirspecDocument | null;
  reportId: string | null;
  reportName: string | null;
  versionId: string | null;
  versionNumber: number | null;
  validationErrors: string[] | null;
  generatedModel: string | null;
  pendingAttachments: ChatImageAttachment[];
  model: string | null;
  generationProgress: GenerateProgressEvent | null;
  onModelChange: (model: string) => void;
  onSendMessage: (content: string) => void;
  onGenerate: () => void;
  onSave: (name: string) => void;
  onAddAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export default function ReportBuilderModal({
  open,
  onClose,
  messages,
  isLoading,
  isChatting,
  isGenerating,
  isUploading,
  readyToGenerate,
  error,
  currentSpec,
  reportId,
  reportName,
  versionId,
  versionNumber,
  validationErrors,
  generatedModel,
  pendingAttachments,
  model,
  generationProgress,
  onModelChange,
  onSendMessage,
  onGenerate,
  onSave,
  onAddAttachments,
  onRemoveAttachment,
}: ReportBuilderModalProps) {
  const [input, setInput] = useState('');
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showDebugJson, setShowDebugJson] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
  const [modelAvailability, setModelAvailability] = useState<ModelAvailability>({ openai: true, anthropic: true });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, readyToGenerate]);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
      reportService.getModelAvailability()
        .then(setModelAvailability)
        .catch(() => {});
    }
  }, [open]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 160;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  if (!open) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isLoading) return;
    setInput('');
    onSendMessage(trimmed || 'Here are some reference images for the chart design.');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      onAddAttachments(imageFiles);
    }
  };

  const handleSave = () => {
    if (reportId && reportName) {
      onSave(reportName);
    } else if (saveName.trim()) {
      onSave(saveName.trim());
      setShowSaveInput(false);
      setSaveName('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onAddAttachments(files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (files.length > 0) {
      onAddAttachments(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-auto my-4 flex w-full max-w-7xl max-h-[calc(100vh-2rem)] rounded-2xl overflow-hidden shadow-2xl bg-white animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Report Builder</h2>
            {isGenerating && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <Loader2 size={12} className="animate-spin" />
                {generationProgress?.status || 'Generating...'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentSpec && (
              <>
                {showSaveInput && !reportId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      placeholder="Report name..."
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                      autoFocus
                    />
                    <button
                      onClick={handleSave}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => reportId ? handleSave() : setShowSaveInput(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <Save size={13} />
                    Save Report
                  </button>
                )}
                <button
                  onClick={() => setShowDebugJson((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    showDebugJson
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Code2 size={13} />
                  Debug
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex w-full pt-[52px] flex-1 min-h-0">
          {/* Chat Panel */}
          <div
            className={`w-[400px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50 relative h-full ${dragOver ? 'ring-2 ring-inset ring-blue-400' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {/* Drag overlay */}
            {dragOver && (
              <div className="absolute inset-0 z-20 bg-blue-50/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <ImageIcon size={32} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-blue-700">Drop images here</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <Bot size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500 font-medium">Describe the report you want</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">
                    Tell me what data to visualize. You can attach reference images of chart styles you like.
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-blue-600" />
                    </div>
                  )}
                  <div className="max-w-[280px]">
                    {/* Attached images */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex flex-wrap gap-1.5 mb-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.attachments.map((att) => (
                          <div key={att.id} className="relative group">
                            <img
                              src={att.url}
                              alt={att.filename}
                              className="w-20 h-20 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                              onClick={() => setPreviewImage({ url: att.url, filename: att.filename })}
                            />
                            <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] text-white font-medium truncate px-1">{att.filename}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Message text */}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm'
                      }`}
                    >
                      <ChatMarkdown
                        content={msg.content.replace('[READY_TO_GENERATE]', '').trim()}
                        variant={msg.role}
                      />
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={14} className="text-slate-600" />
                    </div>
                  )}
                </div>
              ))}

              {isChatting && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Bot size={14} className="text-blue-600" />
                  </div>
                  <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Report Button - appears in chat flow */}
              {readyToGenerate && !isGenerating && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={onGenerate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
                  >
                    <Zap size={16} className="fill-white" />
                    Generate Report
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="flex justify-center py-2">
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-500 text-sm rounded-xl">
                    <Loader2 size={16} className="animate-spin" />
                    {generationProgress?.status || 'Building your report...'}
                  </div>
                </div>
              )}

              {error && (
                <div className="mx-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Model Selector */}
            <div className="px-3 pt-2 border-t border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Model</label>
                <select
                  value={model || 'gpt-5.6'}
                  onChange={(e) => onModelChange(e.target.value)}
                  disabled={messages.length > 0}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                    messages.length > 0 ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''
                  }`}
                >
                  <optgroup label="OpenAI">
                    <option value="gpt-5.6" disabled={!modelAvailability.openai}>
                      GPT-5.6{!modelAvailability.openai ? ' (key not configured)' : ''}
                    </option>
                    <option value="gpt-5.5-pro" disabled={!modelAvailability.openai}>
                      GPT-5.5 Pro{!modelAvailability.openai ? ' (key not configured)' : ''}
                    </option>
                    <option value="gpt-5.5" disabled={!modelAvailability.openai}>
                      GPT-5.5{!modelAvailability.openai ? ' (key not configured)' : ''}
                    </option>
                  </optgroup>
                  <optgroup label="Anthropic">
                    <option value="claude-sonnet-4-6" disabled={!modelAvailability.anthropic}>
                      Claude Sonnet 4{!modelAvailability.anthropic ? ' (key not configured)' : ''}
                    </option>
                    <option value="claude-opus-4-8" disabled={!modelAvailability.anthropic}>
                      Claude Opus 4{!modelAvailability.anthropic ? ' (key not configured)' : ''}
                    </option>
                    <option value="claude-fable-5" disabled={!modelAvailability.anthropic}>
                      Claude Fable 5{!modelAvailability.anthropic ? ' (key not configured)' : ''}
                    </option>
                    <option value="claude-haiku-4-5-20251001" disabled={!modelAvailability.anthropic}>
                      Claude Haiku 4.5{!modelAvailability.anthropic ? ' (key not configured)' : ''}
                    </option>
                  </optgroup>
                </select>
                {(!modelAvailability.openai || !modelAvailability.anthropic) && (
                  <Lock size={12} className="text-slate-400 shrink-0" />
                )}
              </div>
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-200 bg-white shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white focus-within:border-blue-500 transition-colors">
                {/* Pending attachments inside input box */}
                {pendingAttachments.length > 0 && (
                  <div className="px-3 pt-2.5 pb-1 flex flex-wrap gap-2 border-b border-slate-100">
                    {pendingAttachments.map((att) => (
                      <div key={att.id} className="relative group">
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                          onClick={() => setPreviewImage({ url: att.url, filename: att.filename })}
                        />
                        <button
                          onClick={() => onRemoveAttachment(att.id)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {isUploading && (
                      <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                        <Loader2 size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={pendingAttachments.length > 0 ? 'Describe the chart style...' : 'Describe what you need... (Shift+Enter for new line)'}
                  disabled={isLoading || isGenerating}
                  rows={2}
                  className="w-full px-3.5 pt-2.5 pb-2 bg-transparent text-sm focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
                  style={{ minHeight: '52px', maxHeight: '120px' }}
                />
                <div className="flex items-center justify-between px-2 pb-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                    title="Attach reference images (or paste from clipboard)"
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={isLoading || isGenerating || (!input.trim() && pendingAttachments.length === 0)}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="flex-1 overflow-y-auto bg-white">
            {showDebugJson && currentSpec ? (
              <div className="p-4 h-full relative group/debug">
                <div className="absolute top-6 right-6 z-10 flex items-center gap-1.5 opacity-0 group-hover/debug:opacity-100 transition-all">
                  <button
                    onClick={() => {
                      const json = JSON.stringify(currentSpec, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `report-spec-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-2 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-all"
                    title="Download JSON"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(currentSpec, null, 2));
                      setCopyToast(true);
                      setTimeout(() => setCopyToast(false), 2000);
                    }}
                    className="p-2 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-all"
                    title="Copy JSON"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                {copyToast && (
                  <div className="absolute top-6 right-6 z-20 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium shadow-lg animate-fade-in">
                    Copied to clipboard
                  </div>
                )}
                <pre className="text-xs font-mono bg-slate-900 text-green-400 p-4 rounded-xl overflow-auto h-full whitespace-pre-wrap">
                  {JSON.stringify(currentSpec, null, 2)}
                </pre>
              </div>
            ) : currentSpec ? (
              <div className="p-6">
                <ReportPreview
                  spec={currentSpec}
                  reportId={reportId}
                  versionId={versionId}
                  version={versionNumber != null ? {
                    version_number: versionNumber,
                    validation_status: validationErrors && validationErrors.length > 0 ? 'invalid' : 'valid',
                    validation_errors_json: validationErrors,
                    created_at: new Date().toISOString(),
                    generation_model: generatedModel,
                  } : null}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full w-full text-center">
                <div className="w-full h-full">
                  {isGenerating ? (
                    <>
                      <SnakeGame />
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <Sparkles size={24} className="text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-600 font-medium">Report preview will appear here</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Start a conversation to build your report
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-100 transition-colors z-10"
            >
              <X size={16} className="text-slate-700" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.filename}
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            />
            <p className="text-center text-white/80 text-xs mt-3">{previewImage.filename}</p>
          </div>
        </div>
      )}
    </div>
  );
}
