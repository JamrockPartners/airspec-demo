import { supabase, callEdgeFunction, streamEdgeFunction } from './api';
import type { StreamEvent } from './api';
import type { Report, ReportVersion, ChatMessage } from '../types/airspec';

interface ChatResponse {
  message: string;
  isReadyToGenerate: boolean;
}

export interface GenerateResponse {
  reportId: string;
  versionId: string;
  spec: Record<string, unknown>;
  validationErrors: string[] | null;
  model: string | null;
}

export interface GenerateProgressEvent {
  status: string;
  attempt: number;
  totalAttempts: number;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  sessionId: string,
  accountId: string,
  model?: string
): Promise<ChatResponse> {
  return callEdgeFunction<ChatResponse>('airspec-report-chat', {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments ?? [],
    })),
    sessionId,
    accountId,
    model,
  });
}

export async function generateReport(
  params: {
    requirements: string;
    sessionId: string;
    accountId: string;
    reportId?: string;
    existingSpec?: Record<string, unknown>;
    validationErrors?: string[];
    model?: string;
  },
  onProgress?: (event: GenerateProgressEvent) => void
): Promise<GenerateResponse> {
  return new Promise<GenerateResponse>((resolve, reject) => {
    streamEdgeFunction('airspec-report-generate', params, (event: StreamEvent) => {
      if (event.type === 'progress') {
        onProgress?.({
          status: event.status as string,
          attempt: event.attempt as number,
          totalAttempts: event.totalAttempts as number,
        });
      } else if (event.type === 'heartbeat') {
        onProgress?.({
          status: `Generating... (${event.elapsed}s elapsed)`,
          attempt: event.attempt as number,
          totalAttempts: 0,
        });
      } else if (event.type === 'complete') {
        resolve({
          reportId: event.reportId as string,
          versionId: event.versionId as string,
          spec: event.spec as Record<string, unknown>,
          validationErrors: event.validationErrors as string[] | null,
          model: (event.model as string) ?? null,
        });
      } else if (event.type === 'error') {
        reject(new Error(event.message as string));
      }
    }).catch(reject);
  });
}

export async function getReports(accountId = 'default'): Promise<Report[]> {
  const { data, error } = await supabase
    .from('airspec_reports')
    .select('*')
    .eq('account_id', accountId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReportById(reportId: string): Promise<Report | null> {
  const { data, error } = await supabase
    .from('airspec_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getReportVersions(reportId: string): Promise<ReportVersion[]> {
  const { data, error } = await supabase
    .from('airspec_report_versions')
    .select('*')
    .eq('report_id', reportId)
    .order('version_number', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReportVersion(versionId: string): Promise<ReportVersion | null> {
  const { data, error } = await supabase
    .from('airspec_report_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function saveReport(
  reportId: string,
  name: string,
  description?: string
): Promise<Report> {
  const { data, error } = await supabase
    .from('airspec_reports')
    .update({
      name,
      description: description ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function restoreVersion(reportId: string, versionId: string): Promise<void> {
  const { error } = await supabase
    .from('airspec_reports')
    .update({
      current_version_id: versionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

export async function archiveReport(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('airspec_reports')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

export async function updateCardLayout(
  reportId: string,
  layout: 'tall' | 'wide' | null
): Promise<void> {
  const { error } = await supabase
    .from('airspec_reports')
    .update({ card_layout: layout })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

export async function getReportWithVersion(reportId: string): Promise<{
  report: Report;
  version: ReportVersion;
} | null> {
  const report = await getReportById(reportId);
  if (!report || !report.current_version_id) return null;

  const version = await getReportVersion(report.current_version_id);
  if (!version) return null;

  return { report, version };
}

export async function getVersionsByIds(versionIds: string[]): Promise<ReportVersion[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('airspec_report_versions')
    .select('*')
    .in('id', versionIds);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchDataForReport(
  versionId: string,
  datasetId: string,
  parameters: Record<string, unknown>
): Promise<{ rows: Record<string, unknown>[]; totalRows: number; truncated: boolean }> {
  return callEdgeFunction('airspec-data-broker', {
    versionId,
    datasetId,
    parameters,
    accountId: 'default',
  });
}

export async function diagnoseEmptyDataset(
  versionId: string,
  datasetId: string,
  parameters: Record<string, unknown>
): Promise<string> {
  const result = await callEdgeFunction<{ analysis: string }>('airspec-diagnose-empty', {
    versionId,
    datasetId,
    parameters,
  });
  return result.analysis;
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('airspec_report_generation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { role: string; content: string; attachments_json?: unknown[] | null }) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
    attachments: (row.attachments_json as ChatMessage['attachments']) ?? undefined,
  }));
}

export interface ModelAvailability {
  openai: boolean;
  anthropic: boolean;
}

export async function getModelAvailability(): Promise<ModelAvailability> {
  return callEdgeFunction<ModelAvailability>('airspec-model-availability', {});
}

