import { useState, useCallback, useRef } from 'react';
import { reportService, uploadChatImage } from '../services';
import type { ChatMessage, AirspecDocument, ChatImageAttachment } from '../types/airspec';
import type { GenerateProgressEvent } from '../services/reportService';

interface UseReportChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isChatting: boolean;
  isGenerating: boolean;
  isUploading: boolean;
  readyToGenerate: boolean;
  error: string | null;
  currentSpec: AirspecDocument | null;
  reportId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  validationErrors: string[] | null;
  generatedModel: string | null;
  sessionId: string;
  pendingAttachments: ChatImageAttachment[];
  model: string | null;
  generationProgress: GenerateProgressEvent | null;
  setModel: (model: string) => void;
  sendMessage: (content: string) => Promise<void>;
  generate: () => Promise<void>;
  reset: () => void;
  loadExisting: (report: { id: string; session_id: string | null; current_version_id: string | null; model?: string | null }) => Promise<void>;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export function useReportChat(): UseReportChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSpec, setCurrentSpec] = useState<AirspecDocument | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [generatedModel, setGeneratedModel] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerateProgressEvent | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  const addAttachments = useCallback(async (files: File[]) => {
    setIsUploading(true);
    setError(null);

    try {
      const uploaded: ChatImageAttachment[] = [];
      for (const file of files) {
        const attachment = await uploadChatImage(sessionIdRef.current, file);
        uploaded.push(attachment);
      }
      setPendingAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const userMsg: ChatMessage = { role: 'user', content, attachments };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPendingAttachments([]);
    setError(null);
    setIsLoading(true);
    setIsChatting(true);
    setReadyToGenerate(false);

    try {
      const response = await reportService.sendChatMessage(
        newMessages,
        sessionIdRef.current,
        'default',
        model ?? undefined
      );

      const assistantMsg: ChatMessage = { role: 'assistant', content: response.message };
      setMessages([...newMessages, assistantMsg]);

      if (response.isReadyToGenerate) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsChatting(false);
    }
  }, [messages, pendingAttachments]);

  const generate = useCallback(async () => {
    if (!messages.length) return;

    setIsGenerating(true);
    setReadyToGenerate(false);
    setCurrentSpec(null);
    setVersionId(null);
    setError(null);
    setGenerationProgress(null);

    try {
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      const requirements = lastAssistantMsg?.content.replace('[READY_TO_GENERATE]', '').trim() ?? '';

      const genResult = await reportService.generateReport(
        {
          requirements,
          sessionId: sessionIdRef.current,
          accountId: 'default',
          reportId: reportId ?? undefined,
          existingSpec: currentSpec ? (currentSpec as unknown as Record<string, unknown>) : undefined,
          model: model ?? undefined,
        },
        (progress) => setGenerationProgress(progress)
      );

      setReportId(genResult.reportId);
      setVersionId(genResult.versionId);
      setValidationErrors(genResult.validationErrors);
      setGeneratedModel(genResult.model);
      setVersionNumber((prev) => (prev ?? 0) + 1);
      setCurrentSpec(genResult.spec as unknown as AirspecDocument);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  }, [messages, reportId, currentSpec, model]);

  const reset = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
    setIsChatting(false);
    setIsGenerating(false);
    setIsUploading(false);
    setReadyToGenerate(false);
    setError(null);
    setCurrentSpec(null);
    setReportId(null);
    setVersionId(null);
    setVersionNumber(null);
    setValidationErrors(null);
    setGeneratedModel(null);
    setPendingAttachments([]);
    setModel(null);
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  const loadExisting = useCallback(async (report: {
    id: string;
    session_id: string | null;
    current_version_id: string | null;
    model?: string | null;
  }) => {
    if (report.model) setModel(report.model);
    setError(null);
    setReportId(report.id);
    sessionIdRef.current = report.session_id ?? crypto.randomUUID();

    if (report.session_id) {
      try {
        const history = await reportService.getChatHistory(report.session_id);
        setMessages(history);
      } catch {
        setMessages([]);
      }
    }

    if (report.current_version_id) {
      try {
        const version = await reportService.getReportVersion(report.current_version_id);
        if (version?.report_spec_json) {
          setCurrentSpec(version.report_spec_json as unknown as AirspecDocument);
          setVersionId(version.id);
        }
      } catch {
        // version fetch failed, open with empty preview
      }
    }
  }, []);

  return {
    messages,
    isLoading,
    isChatting,
    isGenerating,
    isUploading,
    readyToGenerate,
    error,
    currentSpec,
    reportId,
    versionId,
    versionNumber,
    validationErrors,
    generatedModel,
    sessionId: sessionIdRef.current,
    pendingAttachments,
    model,
    generationProgress,
    setModel,
    sendMessage,
    generate,
    reset,
    loadExisting,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };
}
