import { supabase } from '../lib/supabase';

export { supabase };

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Edge function ${functionName} failed (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

export interface StreamEvent {
  type: 'progress' | 'heartbeat' | 'complete' | 'error';
  [key: string]: unknown;
}

export async function streamEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Edge function ${functionName} failed (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as StreamEvent;
        onEvent(event);
      } catch {
        // skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()) as StreamEvent);
    } catch {
      // skip
    }
  }
}

export interface ChatImageAttachment {
  id: string;
  path: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export async function uploadChatImage(
  sessionId: string,
  file: File
): Promise<ChatImageAttachment> {
  const ext = file.name.split('.').pop() ?? 'png';
  const id = crypto.randomUUID();
  const path = `${sessionId}/${id}.${ext}`;

  const { error } = await supabase.storage
    .from('airspec-chat-images')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from('airspec-chat-images')
    .getPublicUrl(path);

  return {
    id,
    path,
    url: urlData.publicUrl,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  };
}
